import type { FollowUpStatus } from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { systemActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { HOUR, now } from "@/lib/clock";
import { encryptOptional } from "@/lib/crypto";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { logCaseEvent, markMilestone } from "@/lib/services/cases";
import { notify } from "@/lib/services/notifications";

export const FOLLOW_UP_KINDS = ["CHECK_IN_CALL", "REASSESSMENT", "APPOINTMENT_REVIEW", "OTHER"] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

export const FOLLOW_UP_KIND_LABEL: Record<FollowUpKind, string> = {
  CHECK_IN_CALL: "Check-in call or message",
  REASSESSMENT: "Reassessment",
  APPOINTMENT_REVIEW: "Review after an appointment",
  OTHER: "Other follow-up",
};

/** Labels for kinds a clinician schedules when completing a consultation, so care pages never
 * show a raw code. Counsellors schedule only FOLLOW_UP_KINDS. */
const CONSULTATION_KIND_LABEL: Record<string, string> = {
  CHECK_IN: "Check-in call or message",
  MEDICATION_REVIEW: "Medication review",
  COUNSELLING_SESSION: "Counselling session",
};

export function followUpKindLabel(kind: string): string {
  return (FOLLOW_UP_KIND_LABEL as Record<string, string>)[kind] ?? CONSULTATION_KIND_LABEL[kind] ?? "Follow-up";
}

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  SCHEDULED: "Scheduled",
  DONE: "Done",
  MISSED: "Missed",
  CANCELLED: "Cancelled",
};

export const FOLLOW_UP_COMPLETIONS = ["DONE", "MISSED", "CANCELLED"] as const;
export type FollowUpCompletion = (typeof FOLLOW_UP_COMPLETIONS)[number];

export type FollowUpView = "mine" | "all" | "overdue";

export type FollowUpInput = { caseId: string; kind: string; dueAt: Date; assignedToId?: string | null };

export async function scheduleFollowUp(actor: UserActor, input: FollowUpInput): Promise<string> {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  if (!(FOLLOW_UP_KINDS as readonly string[]).includes(input.kind)) fail("VALIDATION", "Choose the kind of follow-up.");
  if (Number.isNaN(input.dueAt.getTime())) fail("VALIDATION", "Choose a valid due date and time.");
  if (input.dueAt.getTime() <= now().getTime()) fail("VALIDATION", "Choose a due time in the future.");
  return db.$transaction(async (tx) => {
    const c = await tx.case.findFirst({ where: { id: input.caseId, institutionId } });
    if (!c) fail("NOT_FOUND", "Case not found.");
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "This case is closed. Reopen it before scheduling a follow-up.");
    const assigneeId = input.assignedToId || actor.userId;
    const assignee = await tx.user.findFirst({
      where: { id: assigneeId, institutionId, role: { in: ["COUNSELLOR", "CLINICIAN"] }, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!assignee) fail("VALIDATION", "Choose an active counsellor or clinician from your institution.");
    const t = now();
    const followUp = await tx.followUp.create({
      data: {
        institutionId,
        caseId: c.id,
        studentId: c.studentId,
        assignedToId: assignee.id,
        kind: input.kind,
        dueAt: input.dueAt,
        createdById: actor.userId,
        createdAt: t,
      },
    });
    await markMilestone(tx, c.id, "FOLLOW_UP_SCHEDULED", actor.userId, `${followUpKindLabel(input.kind)} scheduled, assigned to ${assignee.name}`);
    await recordAudit(tx, actor, {
      action: "followup.schedule",
      entityType: "FollowUp",
      entityId: followUp.id,
      metadata: { caseId: c.id, kind: input.kind, assigneeId: assignee.id },
    });
    return followUp.id;
  });
}

export async function completeFollowUp(
  actor: UserActor,
  followUpId: string,
  input: { status: FollowUpCompletion; outcome?: string | null },
): Promise<void> {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  if (!FOLLOW_UP_COMPLETIONS.includes(input.status)) fail("VALIDATION", "Choose how the follow-up ended.");
  await db.$transaction(async (tx) => {
    const f = await tx.followUp.findFirst({ where: { id: followUpId, institutionId } });
    if (!f) fail("NOT_FOUND", "Follow-up not found.");
    if (f.status !== "SCHEDULED") fail("INVALID_TRANSITION", "This follow-up has already been completed.");
    const t = now();
    const claimed = await tx.followUp.updateMany({
      where: { id: f.id, status: "SCHEDULED" },
      data: { status: input.status, completedAt: t, outcomeCt: encryptOptional(input.outcome?.slice(0, 2000)) },
    });
    if (claimed.count !== 1) fail("INVALID_TRANSITION", "Someone else completed this follow-up a moment ago.");
    if (f.caseId) {
      await logCaseEvent(tx, f.caseId, "FOLLOW_UP_COMPLETED", `${followUpKindLabel(f.kind)} marked as ${FOLLOW_UP_STATUS_LABEL[input.status].toLowerCase()}`, actor.userId);
      await tx.case.update({ where: { id: f.caseId }, data: { updatedAt: t } });
    }
    await recordAudit(tx, actor, {
      action: "followup.complete",
      entityType: "FollowUp",
      entityId: f.id,
      metadata: { status: input.status, caseId: f.caseId },
    });
  });
}

/** Scheduled follow-ups for the care team, soonest first. "overdue" is institution wide. */
export async function listFollowUps(actor: UserActor, filter: { view: FollowUpView }) {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  const t = now();
  const rows = await db.followUp.findMany({
    where: {
      institutionId,
      status: "SCHEDULED",
      ...(filter.view === "mine" ? { assignedToId: actor.userId } : {}),
      ...(filter.view === "overdue" ? { dueAt: { lt: t } } : {}),
    },
    orderBy: { dueAt: "asc" },
    take: 200,
    include: { case: { select: { id: true, reference: true } } },
  });
  const userIds = [...new Set(rows.flatMap((r) => [r.studentId, r.assignedToId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds }, institutionId }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    caseReference: r.case?.reference ?? null,
    studentId: r.studentId,
    studentName: nameById.get(r.studentId) ?? "Unknown student",
    assignedToId: r.assignedToId,
    assignedToName: nameById.get(r.assignedToId) ?? "Unassigned",
    kind: r.kind,
    dueAt: r.dueAt,
    overdue: r.dueAt.getTime() < t.getTime(),
  }));
}

/**
 * Scheduled tick. Reminds assignees of follow-ups that fall due within the next 24 hours (or
 * are already late) and have not been reminded. Returns the number of notifications sent.
 */
export async function notifyDueFollowUps(institutionId: string, at: Date): Promise<number> {
  const horizon = new Date(at.getTime() + 24 * HOUR);
  const due = await db.followUp.findMany({
    where: { institutionId, status: "SCHEDULED", remindedAt: null, dueAt: { lte: horizon } },
    select: { id: true, assignedToId: true, caseId: true },
    orderBy: { dueAt: "asc" },
  });
  if (due.length === 0) return 0;
  return db.$transaction(async (tx) => {
    let sent = 0;
    for (const f of due) {
      // Claim the row first so overlapping ticks cannot remind twice.
      const claimed = await tx.followUp.updateMany({ where: { id: f.id, remindedAt: null, status: "SCHEDULED" }, data: { remindedAt: at } });
      if (claimed.count !== 1) continue;
      await notify(tx, f.assignedToId, "staff_followup_due", {
        institutionId,
        link: f.caseId ? `/counsellor/cases/${f.caseId}` : "/counsellor/follow-ups",
      });
      sent += 1;
    }
    if (sent > 0) {
      await recordAudit(tx, systemActor("scheduler", institutionId), {
        action: "followup.remind",
        entityType: "FollowUp",
        entityId: null,
        metadata: { count: sent },
      });
    }
    return sent;
  });
}
