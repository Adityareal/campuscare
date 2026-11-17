import type { Role } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { decryptField, encryptField } from "@/lib/crypto";
import { db, runTx } from "@/lib/db";
import { fail } from "@/lib/errors";
import { logCaseEvent, markMilestone, OPEN_CASE_STATUSES } from "@/lib/services/cases";
import { careTeamIds, notify } from "@/lib/services/notifications";

const MAX_MESSAGE_LENGTH = 4000;

function cleanBody(body: string): string {
  const text = body.trim();
  if (text.length === 0) fail("VALIDATION", "Write a message first.");
  if (text.length > MAX_MESSAGE_LENGTH) fail("VALIDATION", `Messages can be up to ${MAX_MESSAGE_LENGTH} characters long.`);
  return text;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The whole conversation on a case, for the care team. Every view is audited. */
export async function listCaseMessages(actor: UserActor, caseId: string) {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  const c = await db.case.findFirst({ where: { id: caseId, institutionId }, select: { id: true, reference: true, status: true, studentId: true } });
  if (!c) fail("NOT_FOUND", "Case not found.");
  const rows = await db.message.findMany({ where: { caseId: c.id, institutionId }, orderBy: { createdAt: "asc" }, take: 500 });
  const senders = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((m) => m.senderId))] }, institutionId },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(senders.map((s) => [s.id, s]));
  await recordAudit(db, actor, { action: "message.view", entityType: "Case", entityId: c.id, metadata: { count: rows.length } });
  return {
    caseId: c.id,
    caseStatus: c.status,
    messages: rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: byId.get(m.senderId)?.name ?? "Unknown",
      fromStudent: m.senderId === c.studentId,
      body: decryptField(m.bodyCt),
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
  };
}

/** A staff member writes to the student. The first staff message counts as contact (PRD D3). */
export async function sendCaseMessage(actor: UserActor, caseId: string, body: string): Promise<void> {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  const text = cleanBody(body);
  await runTx(async (tx) => {
    const c = await tx.case.findFirst({ where: { id: caseId, institutionId } });
    if (!c) fail("NOT_FOUND", "Case not found.");
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "This case is closed. Reopen it before writing to the student.");
    const earlierStaffMessages = await tx.message.count({ where: { caseId: c.id, senderId: { not: c.studentId } } });
    const t = now();
    const message = await tx.message.create({
      data: { institutionId, caseId: c.id, senderId: actor.userId, bodyCt: encryptField(text), createdAt: t },
    });
    if (earlierStaffMessages === 0) {
      await markMilestone(tx, c.id, "CONTACTED", actor.userId, "Student contacted by message");
    } else {
      await logCaseEvent(tx, c.id, "MESSAGE_SENT", "Message sent to the student", actor.userId);
      await tx.case.update({ where: { id: c.id }, data: { updatedAt: t } });
    }
    await notify(tx, c.studentId, "message_new", { institutionId, link: "/student/messages" });
    await recordAudit(tx, actor, { action: "message.send", entityType: "Message", entityId: message.id, metadata: { caseId: c.id } });
  });
}

export type StudentThreadMessage = {
  id: string;
  mine: boolean;
  /** Present for staff messages: first name and role only. */
  staff: { firstName: string; role: Role } | null;
  body: string;
  createdAt: Date;
  unread: boolean;
};

export type StudentThread = {
  caseId: string;
  reference: string;
  status: "OPEN" | "ACTIVE" | "MONITORING" | "CLOSED";
  open: boolean;
  openedAt: Date;
  assignee: { firstName: string; role: Role } | null;
  unreadCount: number;
  messages: StudentThreadMessage[];
};

/** The student's own conversations: cases that have messages, plus open cases so the student
 * can write first. Staff appear by first name and role only. */
export async function listStudentThreads(actor: UserActor): Promise<StudentThread[]> {
  assertCan(actor, "own.history.read");
  const institutionId = tenantOf(actor);
  const cases = await db.case.findMany({
    where: {
      institutionId,
      studentId: actor.userId,
      OR: [{ messages: { some: {} } }, { status: { in: [...OPEN_CASE_STATUSES] } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 300 },
      assignments: { where: { endedAt: null }, orderBy: { assignedAt: "desc" }, take: 1 },
    },
  });
  const staffIds = [
    ...new Set(cases.flatMap((c) => [...c.messages.map((m) => m.senderId), ...c.assignments.map((a) => a.userId)]).filter((id) => id !== actor.userId)),
  ];
  const staff = await db.user.findMany({ where: { id: { in: staffIds }, institutionId }, select: { id: true, name: true, role: true } });
  const byId = new Map(staff.map((s) => [s.id, s]));
  return cases.map((c) => {
    const assigned = c.assignments[0] ? byId.get(c.assignments[0].userId) : undefined;
    const messages = c.messages.map((m) => {
      const mine = m.senderId === actor.userId;
      const sender = mine ? undefined : byId.get(m.senderId);
      return {
        id: m.id,
        mine,
        staff: sender ? { firstName: firstName(sender.name), role: sender.role } : null,
        body: decryptField(m.bodyCt),
        createdAt: m.createdAt,
        unread: !mine && m.readAt === null,
      };
    });
    return {
      caseId: c.id,
      reference: c.reference,
      status: c.status,
      open: c.status !== "CLOSED",
      openedAt: c.openedAt,
      assignee: assigned ? { firstName: firstName(assigned.name), role: assigned.role } : null,
      unreadCount: messages.filter((m) => m.unread).length,
      messages,
    };
  });
}

/** The student replies on their own case. Assigned staff are notified, or the counsellors when nobody is assigned. */
export async function sendStudentMessage(actor: UserActor, caseId: string, body: string): Promise<void> {
  assertCan(actor, "message.send");
  assertCan(actor, "own.history.read");
  const institutionId = tenantOf(actor);
  const text = cleanBody(body);
  await runTx(async (tx) => {
    const c = await tx.case.findFirst({ where: { id: caseId, institutionId, studentId: actor.userId } });
    if (!c) fail("NOT_FOUND", "Conversation not found.");
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "This conversation is closed. You can ask for support to start a new one.");
    const t = now();
    const message = await tx.message.create({
      data: { institutionId, caseId: c.id, senderId: actor.userId, bodyCt: encryptField(text), createdAt: t },
    });
    const assigned = await tx.caseAssignment.findMany({ where: { caseId: c.id, endedAt: null }, select: { userId: true } });
    const recipients = assigned.length > 0 ? assigned.map((a) => a.userId) : await careTeamIds(tx, institutionId);
    await notify(tx, recipients, "staff_message_new", { institutionId, link: `/counsellor/cases/${c.id}` });
    await logCaseEvent(tx, c.id, "MESSAGE_RECEIVED", "Student sent a message", actor.userId);
    await tx.case.update({ where: { id: c.id }, data: { updatedAt: t } });
    await recordAudit(tx, actor, { action: "message.send", entityType: "Message", entityId: message.id, metadata: { caseId: c.id } });
  });
}

/** Marks the staff messages in one of the student's own conversations as read. */
export async function markThreadRead(actor: UserActor, caseId: string): Promise<number> {
  assertCan(actor, "own.history.read");
  const institutionId = tenantOf(actor);
  const c = await db.case.findFirst({ where: { id: caseId, institutionId, studentId: actor.userId }, select: { id: true } });
  if (!c) fail("NOT_FOUND", "Conversation not found.");
  const result = await db.message.updateMany({
    where: { caseId: c.id, institutionId, readAt: null, senderId: { not: actor.userId } },
    data: { readAt: now() },
  });
  return result.count;
}
