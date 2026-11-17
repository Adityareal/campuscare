import type { CaseSource, TriageCategory } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { decryptOptional, encryptField, encryptOptional, shortReference } from "@/lib/crypto";
import { db, runTx, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { CATEGORY_RANK } from "@/lib/risk/rules";
import { notify } from "@/lib/services/notifications";

/** Case lifecycle milestones (PRD D3). Each is stamped the first time it happens. */
export const MILESTONES = {
  ACKNOWLEDGED: "acknowledgedAt",
  REVIEWED: "reviewedAt",
  CONTACTED: "contactedAt",
  ARRANGED: "arrangedAt",
  REFERRED: "referredAt",
  APPOINTMENT_UPDATED: "appointmentUpdatedAt",
  FOLLOW_UP_SCHEDULED: "followUpScheduledAt",
  OUTCOME_DOCUMENTED: "outcomeDocumentedAt",
} as const;
export type Milestone = keyof typeof MILESTONES;

export const OPEN_CASE_STATUSES = ["OPEN", "ACTIVE", "MONITORING"] as const;

/** Case history entry. `summary` is system wording only; anything a person typed goes to
 * `detail`, which is stored encrypted. */
export async function logCaseEvent(
  client: DbLike,
  caseId: string,
  type: string,
  summary: string,
  actorId: string | null,
  detail?: string | null,
): Promise<void> {
  await client.caseEvent.create({
    data: { caseId, actorId, type, summary, detailCt: encryptOptional(detail?.slice(0, 2000)), createdAt: now() },
  });
}

/** Finds the student's open case or opens one. Raises (never lowers) its priority and
 * re-activates a case that was in monitoring. */
export async function ensureOpenCase(
  client: DbLike,
  p: { institutionId: string; studentId: string; priority: TriageCategory; source: CaseSource; actorId: string | null; summary: string },
): Promise<{ caseId: string; created: boolean }> {
  const t = now();
  const existing = await client.case.findFirst({
    where: { institutionId: p.institutionId, studentId: p.studentId, status: { in: [...OPEN_CASE_STATUSES] } },
    orderBy: { openedAt: "desc" },
  });
  if (existing) {
    const raise = CATEGORY_RANK[p.priority] > CATEGORY_RANK[existing.priority];
    const reactivate = existing.status === "MONITORING";
    await client.case.update({
      where: { id: existing.id },
      data: { ...(raise ? { priority: p.priority } : {}), ...(reactivate ? { status: "ACTIVE" as const } : {}), updatedAt: t },
    });
    await logCaseEvent(client, existing.id, reactivate ? "REOPENED" : "NOTE", p.summary, p.actorId);
    return { caseId: existing.id, created: false };
  }
  const created = await client.case.create({
    data: {
      institutionId: p.institutionId,
      studentId: p.studentId,
      reference: shortReference("C"),
      priority: p.priority,
      source: p.source,
      openedAt: t,
      updatedAt: t,
    },
  });
  await logCaseEvent(client, created.id, "OPENED", p.summary, p.actorId);
  return { caseId: created.id, created: true };
}

export async function linkAlertToCase(client: DbLike, caseId: string, alertId: string): Promise<void> {
  await client.caseAlert.upsert({
    where: { caseId_alertId: { caseId, alertId } },
    update: {},
    create: { caseId, alertId, linkedAt: now() },
  });
}

/** Stamps a milestone the first time it happens and always logs the event. Any human action
 * moves a new case to ACTIVE. Nothing here can close a case. */
export async function markMilestone(
  client: DbLike,
  caseId: string,
  milestone: Milestone,
  actorId: string | null,
  summary: string,
  detail?: string | null,
): Promise<void> {
  const c = await client.case.findUniqueOrThrow({ where: { id: caseId } });
  const field = MILESTONES[milestone];
  const t = now();
  // Only care staff move a new case to ACTIVE. A student's own step (such as booking) is
  // logged under their name but does not mean the care team has picked the case up.
  const actorIsStaff = actorId
    ? (await client.user.findUnique({ where: { id: actorId }, select: { role: true } }))?.role !== "STUDENT"
    : false;
  await client.case.update({
    where: { id: caseId },
    data: {
      ...(c[field] ? {} : { [field]: t }),
      ...(actorIsStaff && c.status === "OPEN" ? { status: "ACTIVE" as const } : {}),
      updatedAt: t,
    },
  });
  await logCaseEvent(client, caseId, milestone, summary, actorId, detail);
}

async function caseInTenant(client: DbLike, actor: UserActor, caseId: string) {
  const c = await client.case.findFirst({ where: { id: caseId, institutionId: tenantOf(actor) } });
  if (!c) fail("NOT_FOUND", "Case not found.");
  return c;
}

export async function getCaseDetail(actor: UserActor, caseId: string) {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  const c = await db.case.findFirst({
    where: { id: caseId, institutionId },
    include: {
      student: { select: { id: true, name: true, email: true, locale: true, student: { include: { department: true } } } },
      assignments: { where: { endedAt: null }, orderBy: { assignedAt: "desc" } },
      alerts: {
        include: {
          alert: { select: { id: true, reference: true, category: true, status: true, title: true, createdAt: true, acknowledgedAt: true } },
        },
      },
      helpRequests: { orderBy: { createdAt: "desc" } },
      referrals: { orderBy: { createdAt: "desc" }, include: { appointments: { orderBy: { startsAt: "desc" } } } },
      followUps: { orderBy: { dueAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 80 },
    },
  });
  if (!c) fail("NOT_FOUND", "Case not found.");
  await recordAudit(db, actor, { action: "case.view", entityType: "Case", entityId: c.id, metadata: { studentId: c.studentId } });
  const staffIds = [
    ...new Set(
      [
        ...c.assignments.map((a) => a.userId),
        ...c.events.map((e) => e.actorId),
        ...c.followUps.map((f) => f.assignedToId),
        ...c.referrals.map((r) => r.createdById),
      ].filter((x): x is string => !!x),
    ),
  ];
  const staff = await db.user.findMany({ where: { id: { in: staffIds }, institutionId }, select: { id: true, name: true, role: true } });
  // The lifecycle starts when the first linked alert or request arrived, which can be before
  // the case itself was opened (a person opens it while reviewing the alert).
  const receivedAt = new Date(
    Math.min(c.openedAt.getTime(), ...c.alerts.map((l) => l.alert.createdAt.getTime()), ...c.helpRequests.map((h) => h.createdAt.getTime())),
  );
  return {
    ...c,
    receivedAt,
    outcomeNote: decryptOptional(c.outcomeNoteCt),
    helpRequests: c.helpRequests.map((h) => ({ ...h, details: decryptOptional(h.detailsCt) })),
    events: c.events.map((e) => ({ ...e, detail: decryptOptional(e.detailCt) })),
    referrals: c.referrals.map((r) => ({ ...r, reason: decryptOptional(r.reasonCt) })),
    followUps: c.followUps.map((f) => ({ ...f, outcome: decryptOptional(f.outcomeCt) })),
    staffById: new Map(staff.map((s) => [s.id, s])),
  };
}

export async function listCases(actor: UserActor, filter: { status?: "OPEN_ANY" | "CLOSED"; mine?: boolean } = {}) {
  assertCan(actor, "case.manage");
  const institutionId = tenantOf(actor);
  return db.case.findMany({
    where: {
      institutionId,
      status: filter.status === "CLOSED" ? "CLOSED" : { in: [...OPEN_CASE_STATUSES] },
      ...(filter.mine ? { assignments: { some: { userId: actor.userId, endedAt: null } } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    include: {
      student: { select: { name: true, student: { select: { studentNumber: true, department: { select: { name: true } } } } } },
      assignments: { where: { endedAt: null }, select: { userId: true } },
      followUps: { where: { status: "SCHEDULED" }, orderBy: { dueAt: "asc" }, take: 1 },
    },
  });
}

export async function assignCase(actor: UserActor, caseId: string, assigneeId: string): Promise<void> {
  assertCan(actor, "case.manage");
  await runTx(async (tx) => {
    const c = await caseInTenant(tx, actor, caseId);
    const assignee = await tx.user.findFirst({
      where: { id: assigneeId, institutionId: c.institutionId, role: { in: ["COUNSELLOR", "CLINICIAN"] }, status: "ACTIVE" },
    });
    if (!assignee) fail("VALIDATION", "Choose an active counsellor or clinician from your institution.");
    const t = now();
    await tx.caseAssignment.updateMany({ where: { caseId, endedAt: null }, data: { endedAt: t } });
    await tx.caseAssignment.create({ data: { caseId, userId: assignee.id, assignedById: actor.userId, assignedAt: t } });
    await tx.case.update({
      where: { id: caseId },
      data: { ...(c.status === "OPEN" ? { status: "ACTIVE" as const } : {}), acknowledgedAt: c.acknowledgedAt ?? t, updatedAt: t },
    });
    await logCaseEvent(tx, caseId, "ASSIGNED", `Assigned to ${assignee.name}`, actor.userId);
    if (assignee.id !== actor.userId) {
      await notify(tx, assignee.id, "staff_case_assigned", { institutionId: c.institutionId, link: `/counsellor/cases/${caseId}` });
    }
    await recordAudit(tx, actor, { action: "case.assign", entityType: "Case", entityId: caseId, metadata: { assigneeId: assignee.id } });
  });
}

const ACTION_SUMMARY: Record<"ACKNOWLEDGED" | "REVIEWED" | "CONTACTED" | "ARRANGED", string> = {
  ACKNOWLEDGED: "Case acknowledged",
  REVIEWED: "Human review completed",
  CONTACTED: "Student contacted",
  ARRANGED: "Assessment or consultation arranged",
};

export async function recordCaseAction(
  actor: UserActor,
  caseId: string,
  milestone: keyof typeof ACTION_SUMMARY,
  note?: string | null,
): Promise<void> {
  assertCan(actor, "case.manage");
  await runTx(async (tx) => {
    const c = await caseInTenant(tx, actor, caseId);
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "Reopen the case before recording new actions.");
    await markMilestone(tx, caseId, milestone, actor.userId, ACTION_SUMMARY[milestone], note?.trim() || null);
    await recordAudit(tx, actor, { action: `case.${milestone.toLowerCase()}`, entityType: "Case", entityId: caseId });
  });
}

/** Adds a free-text note to the case history (stored encrypted). */
export async function addCaseNote(actor: UserActor, caseId: string, note: string): Promise<void> {
  assertCan(actor, "case.manage");
  const text = note.trim();
  if (text.length < 3) fail("VALIDATION", "Write a note first.");
  await runTx(async (tx) => {
    await caseInTenant(tx, actor, caseId);
    await logCaseEvent(tx, caseId, "NOTE", "Note added", actor.userId, text);
    await recordAudit(tx, actor, { action: "case.note", entityType: "Case", entityId: caseId });
  });
}

export async function documentOutcome(actor: UserActor, caseId: string, note: string): Promise<void> {
  assertCan(actor, "case.manage");
  const text = note.trim();
  if (text.length < 10) fail("VALIDATION", "Describe the outcome in at least a sentence.");
  await runTx(async (tx) => {
    const c = await caseInTenant(tx, actor, caseId);
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "This case is closed.");
    const t = now();
    await tx.case.update({
      where: { id: caseId },
      data: { outcomeNoteCt: encryptField(text.slice(0, 4000)), outcomeDocumentedAt: t, updatedAt: t },
    });
    await logCaseEvent(tx, caseId, "OUTCOME_DOCUMENTED", "Outcome documented", actor.userId);
    await recordAudit(tx, actor, { action: "case.outcome_documented", entityType: "Case", entityId: caseId });
  });
}

/** Closing needs a documented outcome, every linked alert closed by a human, and no follow-up
 * still scheduled. A referral alone never closes a case (PRD D3). */
export async function closeCase(actor: UserActor, caseId: string): Promise<void> {
  assertCan(actor, "case.manage");
  await runTx(async (tx) => {
    const c = await caseInTenant(tx, actor, caseId);
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "This case is already closed.");
    if (!c.outcomeDocumentedAt) fail("INVALID_TRANSITION", "Document the outcome before closing the case.");
    const openAlerts = await tx.caseAlert.count({ where: { caseId, alert: { status: { not: "CLOSED" } } } });
    if (openAlerts) fail("HUMAN_REVIEW_REQUIRED", `Review and close the ${openAlerts} linked alert(s) first.`);
    const pending = await tx.followUp.count({ where: { caseId, status: "SCHEDULED" } });
    if (pending) fail("INVALID_TRANSITION", `Complete or cancel the ${pending} scheduled follow-up(s) first.`);
    const t = now();
    await tx.case.update({ where: { id: caseId }, data: { status: "CLOSED", closedAt: t, updatedAt: t } });
    await logCaseEvent(tx, caseId, "CLOSED", "Case closed", actor.userId);
    await recordAudit(tx, actor, { action: "case.close", entityType: "Case", entityId: caseId });
  });
}

export async function returnToMonitoring(actor: UserActor, caseId: string, nextReviewAt: Date): Promise<void> {
  assertCan(actor, "case.manage");
  if (!(nextReviewAt.getTime() > now().getTime())) fail("VALIDATION", "Choose a review date in the future.");
  await runTx(async (tx) => {
    const c = await caseInTenant(tx, actor, caseId);
    if (c.status === "CLOSED" || c.status === "MONITORING") fail("INVALID_TRANSITION", "Only an active case can return to monitoring.");
    if (!c.outcomeDocumentedAt) fail("INVALID_TRANSITION", "Document the outcome before returning the case to monitoring.");
    const openUrgent = await tx.caseAlert.count({ where: { caseId, alert: { status: { not: "CLOSED" }, category: "URGENT" } } });
    if (openUrgent) fail("HUMAN_REVIEW_REQUIRED", "An urgent alert on this case is still open.");
    const t = now();
    await tx.case.update({
      where: { id: caseId },
      data: { status: "MONITORING", returnedToMonitoringAt: t, nextReviewAt, followUpScheduledAt: c.followUpScheduledAt ?? t, updatedAt: t },
    });
    await tx.followUp.create({
      data: {
        institutionId: c.institutionId,
        caseId,
        studentId: c.studentId,
        assignedToId: actor.userId,
        kind: "REASSESSMENT",
        dueAt: nextReviewAt,
        createdById: actor.userId,
        createdAt: t,
      },
    });
    await logCaseEvent(tx, caseId, "RETURNED_TO_MONITORING", "Returned to monitoring with a scheduled review", actor.userId);
    await recordAudit(tx, actor, { action: "case.return_to_monitoring", entityType: "Case", entityId: caseId });
  });
}

export async function reopenCase(actor: UserActor, caseId: string): Promise<void> {
  assertCan(actor, "case.manage");
  await runTx(async (tx) => {
    const c = await caseInTenant(tx, actor, caseId);
    if (c.status !== "CLOSED" && c.status !== "MONITORING") fail("INVALID_TRANSITION", "This case is already open.");
    await tx.case.update({ where: { id: caseId }, data: { status: "ACTIVE", closedAt: null, updatedAt: now() } });
    await logCaseEvent(tx, caseId, "REOPENED", "Case reopened", actor.userId);
    await recordAudit(tx, actor, { action: "case.reopen", entityType: "Case", entityId: caseId });
  });
}

/** False-negative review (PRD C6): marks a case that the rules should have flagged earlier. */
export async function setMissedConcern(actor: UserActor, caseId: string, missed: boolean): Promise<void> {
  assertCan(actor, "case.manage");
  await runTx(async (tx) => {
    await caseInTenant(tx, actor, caseId);
    await tx.case.update({ where: { id: caseId }, data: { missedConcern: missed, updatedAt: now() } });
    await logCaseEvent(tx, caseId, "NOTE", missed ? "Flagged for missed-concern review" : "Missed-concern flag removed", actor.userId);
    await recordAudit(tx, actor, { action: "case.missed_concern", entityType: "Case", entityId: caseId, metadata: { missed } });
  });
}
