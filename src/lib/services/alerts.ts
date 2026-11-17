import type { Alert, AlertDecision, ReviewerFeedback, TriageCategory } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { decryptOptional, encryptOptional } from "@/lib/crypto";
import { db, runTx, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { CATEGORY_LEAD, RECOMMENDED_ACTION, type EvidenceRef } from "@/lib/risk/engine";
import { CATEGORY_RANK, RULE_LABELS } from "@/lib/risk/rules";
import { ensureOpenCase, linkAlertToCase, markMilestone, OPEN_CASE_STATUSES } from "@/lib/services/cases";
import { ackWindowMs, getInstitutionSettings } from "@/lib/services/config";
import { getConsentState } from "@/lib/services/consent";
import { careTeamIds, notify } from "@/lib/services/notifications";
import { startEscalation } from "@/lib/services/risk";

/**
 * Human review of early-warning alerts (PRD C5). Every function here requires a signed-in
 * counsellor or clinician (assertCan only ever passes for a UserActor), so no automated
 * process can acknowledge, lower or close an alert.
 *
 * Status flow: NEW -> ACKNOWLEDGED -> REVIEWED -> CLOSED. When the rules raise an alert's
 * category it returns to NEW and needs a fresh acknowledgement and review decision.
 */

export const DECISION_LABEL: Record<AlertDecision, string> = {
  NO_ACTION_NEEDED: "No action needed",
  OUTREACH: "Reach out to the student",
  FURTHER_ASSESSMENT: "Request further assessment",
  REFERRAL: "Refer to a professional",
  CRISIS_PROTOCOL: "Follow the crisis protocol",
};

export const FEEDBACK_LABEL: Record<ReviewerFeedback, string> = {
  APPROPRIATE: "The alert was appropriate",
  NOT_NEEDED: "The alert was not needed",
  UNDER_TRIAGED: "The category was too low",
};

export const ESCALATION_TARGETS = ["ON_CALL", "STUDENT", "EXTERNAL_SERVICE"] as const;
export const ESCALATION_CHANNELS = ["PHONE", "IN_PERSON", "SECURE_MESSAGE", "OTHER"] as const;
export const ESCALATION_OUTCOMES = ["REACHED", "NO_ANSWER", "LEFT_MESSAGE", "HANDED_OVER"] as const;
export type EscalationTarget = (typeof ESCALATION_TARGETS)[number];
export type EscalationChannel = (typeof ESCALATION_CHANNELS)[number];
export type EscalationOutcome = (typeof ESCALATION_OUTCOMES)[number];

export const TARGET_LABEL: Record<EscalationTarget, string> = {
  ON_CALL: "On-call responder",
  STUDENT: "Student",
  EXTERNAL_SERVICE: "Outside service",
};
export const CHANNEL_LABEL: Record<EscalationChannel | "IN_APP", string> = {
  PHONE: "Phone",
  IN_PERSON: "In person",
  SECURE_MESSAGE: "Secure message",
  OTHER: "Other",
  IN_APP: "In-app notification",
};
export const OUTCOME_LABEL: Record<EscalationOutcome | "NOTIFIED" | "RE_ESCALATED", string> = {
  REACHED: "Reached",
  NO_ANSWER: "No answer",
  LEFT_MESSAGE: "Left a message",
  HANDED_OVER: "Handed over",
  NOTIFIED: "Notified automatically",
  RE_ESCALATED: "Re-notified: not acknowledged in time",
};

export type AlertView = "open" | "mine" | "unassigned" | "closed";

type AlertCore = Pick<Alert, "id" | "institutionId" | "studentId" | "category" | "reference" | "title" | "slaDueAt">;

async function alertInTenant(client: DbLike, actor: UserActor, alertId: string): Promise<Alert> {
  const a = await client.alert.findFirst({ where: { id: alertId, institutionId: tenantOf(actor) } });
  if (!a) fail("NOT_FOUND", "Alert not found.");
  return a;
}

/** `note` is system wording; `detail` is anything a person typed and is stored encrypted. */
async function logAlertEvent(
  client: DbLike,
  alertId: string,
  type: string,
  actorId: string | null,
  opts: { note?: string; detail?: string | null; fromCategory?: TriageCategory; toCategory?: TriageCategory } = {},
): Promise<void> {
  await client.alertEvent.create({
    data: {
      alertId,
      actorId,
      type,
      note: opts.note ?? null,
      noteCt: encryptOptional(opts.detail?.slice(0, 2000)),
      fromCategory: opts.fromCategory ?? null,
      toCategory: opts.toCategory ?? null,
      createdAt: now(),
    },
  });
}

async function linkedOpenCaseIds(client: DbLike, alertId: string): Promise<string[]> {
  const links = await client.caseAlert.findMany({
    where: { alertId, case: { status: { in: [...OPEN_CASE_STATUSES] } } },
    select: { caseId: true },
  });
  return links.map((l) => l.caseId);
}

async function ensureCaseForAlert(client: DbLike, actor: UserActor, a: AlertCore, summary: string): Promise<string> {
  const { caseId } = await ensureOpenCase(client, {
    institutionId: a.institutionId,
    studentId: a.studentId,
    priority: a.category,
    source: "ALERT",
    actorId: actor.userId,
    summary,
  });
  await linkAlertToCase(client, caseId, a.id);
  // A case opened after the alert was handled inherits the earlier acknowledgement, so the
  // lifecycle reads in the order things happened. The person working the alert holds the case
  // until someone reassigns it.
  const [alert, c, holder] = await Promise.all([
    client.alert.findUnique({ where: { id: a.id }, select: { acknowledgedAt: true } }),
    client.case.findUnique({ where: { id: caseId }, select: { acknowledgedAt: true } }),
    client.caseAssignment.findFirst({ where: { caseId, endedAt: null }, select: { id: true } }),
  ]);
  if (!c?.acknowledgedAt) {
    await client.case.update({ where: { id: caseId }, data: { acknowledgedAt: alert?.acknowledgedAt ?? now() } });
  }
  if (!holder) {
    await client.caseAssignment.create({ data: { caseId, userId: actor.userId, assignedById: actor.userId, assignedAt: now() } });
  }
  return caseId;
}

function retitle(title: string, category: TriageCategory): string {
  return /^[^:]+:/.test(title) ? title.replace(/^[^:]+:/, `${CATEGORY_LEAD[category]}:`) : `${CATEGORY_LEAD[category]}: ${title}`;
}

async function raiseToUrgent(client: DbLike, actor: UserActor, a: AlertCore, reason: string): Promise<void> {
  const settings = await getInstitutionSettings(client, a.institutionId);
  const t = now();
  await client.alert.update({
    where: { id: a.id },
    data: {
      category: "URGENT",
      title: retitle(a.title, "URGENT"),
      recommendedAction: RECOMMENDED_ACTION.URGENT,
      slaDueAt: new Date(Math.min(a.slaDueAt.getTime(), t.getTime() + ackWindowMs("URGENT", settings))),
    },
  });
  await logAlertEvent(client, a.id, "CATEGORY_RAISED", actor.userId, { note: reason, fromCategory: a.category, toCategory: "URGENT" });
  await ensureCaseForAlert(client, actor, { ...a, category: "URGENT" }, `Alert ${a.reference} escalated to urgent`);
  await startEscalation(client, a.id, settings, await careTeamIds(client, a.institutionId), t);
}

// ---------- Queries ----------

export async function listAlerts(actor: UserActor, filter: { view?: AlertView; category?: TriageCategory } = {}) {
  assertCan(actor, "alert.review");
  const institutionId = tenantOf(actor);
  const view = filter.view ?? "open";
  const rows = await db.alert.findMany({
    where: {
      institutionId,
      status: view === "closed" ? "CLOSED" : { not: "CLOSED" },
      ...(view === "mine" ? { assignedToId: actor.userId } : {}),
      ...(view === "unassigned" ? { assignedToId: null } : {}),
      ...(filter.category ? { category: filter.category } : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          student: { select: { studentNumber: true, academicYear: true, department: { select: { name: true } } } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { indicators: true } },
    },
    orderBy: view === "closed" ? { closedAt: "desc" } : { createdAt: "asc" },
    take: 200,
  });
  const t = now().getTime();
  const flagged = rows.map((r) => ({ ...r, overdue: r.status === "NEW" && r.slaDueAt.getTime() < t }));
  if (view === "closed") return flagged;
  return flagged.sort(
    (a, b) =>
      CATEGORY_RANK[b.category] - CATEGORY_RANK[a.category] ||
      Number(b.overdue) - Number(a.overdue) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export async function alertQueueSummary(actor: UserActor) {
  assertCan(actor, "alert.review");
  const institutionId = tenantOf(actor);
  const open = await db.alert.findMany({
    where: { institutionId, status: { not: "CLOSED" } },
    select: { category: true, status: true, slaDueAt: true, assignedToId: true },
  });
  const t = now().getTime();
  const byCategory: Record<TriageCategory, number> = { URGENT: 0, PRIORITY: 0, MONITOR: 0, ROUTINE: 0 };
  for (const a of open) byCategory[a.category] += 1;
  return {
    open: open.length,
    byCategory,
    awaitingAcknowledgement: open.filter((a) => a.status === "NEW").length,
    overdue: open.filter((a) => a.status === "NEW" && a.slaDueAt.getTime() < t).length,
    assignedToMe: open.filter((a) => a.assignedToId === actor.userId).length,
  };
}

export async function getAlertDetail(actor: UserActor, alertId: string) {
  assertCan(actor, "alert.review");
  const institutionId = tenantOf(actor);
  const a = await db.alert.findFirst({
    where: { id: alertId, institutionId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          locale: true,
          student: { select: { studentNumber: true, academicYear: true, contactPhone: true, department: { select: { name: true } } } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
      indicators: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      escalations: { orderBy: { attemptedAt: "asc" } },
      cases: { include: { case: { select: { id: true, reference: true, status: true, priority: true } } } },
    },
  });
  if (!a) fail("NOT_FOUND", "Alert not found.");
  await recordAudit(db, actor, { action: "alert.view", entityType: "Alert", entityId: a.id, metadata: { studentId: a.studentId } });
  const consent = await getConsentState(db, a.studentId);
  const staffIds = [
    ...new Set(
      [
        ...a.events.map((e) => e.actorId),
        ...a.escalations.map((e) => e.targetUserId),
        ...a.escalations.map((e) => e.recordedById),
        a.acknowledgedById,
        a.reviewedById,
        a.closedById,
      ].filter((x): x is string => !!x),
    ),
  ];
  const staff = await db.user.findMany({ where: { id: { in: staffIds }, institutionId }, select: { id: true, name: true, role: true } });
  return {
    ...a,
    overdue: a.status === "NEW" && a.slaDueAt.getTime() < now().getTime(),
    decisionNote: decryptOptional(a.decisionNoteCt),
    indicators: a.indicators.map((i) => ({
      ...i,
      label: RULE_LABELS[i.ruleCode] ?? i.ruleCode,
      evidence: (Array.isArray(i.evidence) ? i.evidence : []) as unknown as EvidenceRef[],
    })),
    events: a.events.map((e) => ({ ...e, detail: decryptOptional(e.noteCt) })),
    escalations: a.escalations.map((e) => ({ ...e, detail: decryptOptional(e.noteCt) })),
    consent,
    staffById: new Map(staff.map((s) => [s.id, s])),
  };
}

/** Counsellors and clinicians of the actor's institution, for assignment pickers. */
export async function listCareTeam(actor: UserActor) {
  assertCan(actor, "alert.review");
  return db.user.findMany({
    where: { institutionId: tenantOf(actor), role: { in: ["COUNSELLOR", "CLINICIAN"] }, status: "ACTIVE" },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

// ---------- Actions ----------

export async function acknowledgeAlert(actor: UserActor, alertId: string): Promise<void> {
  assertCan(actor, "alert.review");
  await runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status !== "NEW") fail("INVALID_TRANSITION", "This alert has already been acknowledged.");
    const t = now();
    const claimed = await tx.alert.updateMany({
      where: { id: a.id, status: "NEW" },
      data: {
        status: "ACKNOWLEDGED",
        // The first acknowledgement time is kept for response-time reporting.
        acknowledgedAt: a.acknowledgedAt ?? t,
        acknowledgedById: actor.userId,
        assignedToId: a.assignedToId ?? actor.userId,
      },
    });
    if (claimed.count !== 1) fail("INVALID_TRANSITION", "Someone else acknowledged this alert a moment ago.");
    await tx.escalationAttempt.updateMany({
      where: { alertId: a.id, targetUserId: actor.userId, acknowledgedAt: null },
      data: { acknowledgedAt: t },
    });
    await logAlertEvent(tx, a.id, "ACKNOWLEDGED", actor.userId);
    for (const caseId of await linkedOpenCaseIds(tx, a.id)) {
      await markMilestone(tx, caseId, "ACKNOWLEDGED", actor.userId, `Alert ${a.reference} acknowledged`);
    }
    await recordAudit(tx, actor, { action: "alert.acknowledge", entityType: "Alert", entityId: a.id, metadata: { category: a.category } });
  });
}

export async function assignAlert(actor: UserActor, alertId: string, assigneeId: string): Promise<void> {
  assertCan(actor, "alert.review");
  await runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status === "CLOSED") fail("INVALID_TRANSITION", "This alert is closed.");
    const assignee = await tx.user.findFirst({
      where: { id: assigneeId, institutionId: a.institutionId, role: { in: ["COUNSELLOR", "CLINICIAN"] }, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!assignee) fail("VALIDATION", "Choose an active counsellor or clinician from your institution.");
    await tx.alert.update({ where: { id: a.id }, data: { assignedToId: assignee.id } });
    await logAlertEvent(tx, a.id, "ASSIGNED", actor.userId, { note: `Assigned to ${assignee.name}` });
    if (assignee.id !== actor.userId) {
      await notify(tx, assignee.id, a.category === "URGENT" ? "staff_alert_urgent" : "staff_alert_new", {
        institutionId: a.institutionId,
        link: `/counsellor/alerts/${a.id}`,
      });
    }
    await recordAudit(tx, actor, { action: "alert.assign", entityType: "Alert", entityId: a.id, metadata: { assigneeId: assignee.id } });
  });
}

export type ReviewInput = { decision: AlertDecision; feedback: ReviewerFeedback | null; note?: string | null };

/** Records the reviewer's decision. Any decision other than "no action" puts the alert on the
 * student's case (opening one if needed). Choosing the crisis protocol makes the alert urgent. */
export async function reviewAlert(actor: UserActor, alertId: string, input: ReviewInput): Promise<{ caseId: string | null }> {
  assertCan(actor, "alert.review");
  if (!(input.decision in DECISION_LABEL)) fail("VALIDATION", "Choose a decision.");
  if (input.feedback && !(input.feedback in FEEDBACK_LABEL)) fail("VALIDATION", "Choose valid feedback.");
  const note = input.note?.trim() ?? "";
  return runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status === "CLOSED") fail("INVALID_TRANSITION", "This alert is closed. Continue the work on the student's case.");
    const needsNote = a.category === "URGENT" || (input.decision === "NO_ACTION_NEEDED" && a.category === "PRIORITY");
    if (needsNote && note.length < 10) fail("VALIDATION", "Explain the decision in a sentence or two. It is required for this alert.");
    const t = now();
    await tx.alert.update({
      where: { id: a.id },
      data: {
        status: "REVIEWED",
        acknowledgedAt: a.acknowledgedAt ?? t,
        acknowledgedById: a.acknowledgedById ?? actor.userId,
        assignedToId: a.assignedToId ?? actor.userId,
        reviewedAt: t,
        reviewedById: actor.userId,
        decision: input.decision,
        reviewerFeedback: input.feedback,
        decisionNoteCt: note ? encryptOptional(note.slice(0, 4000)) : a.decisionNoteCt,
      },
    });
    if (a.status === "NEW") {
      await tx.escalationAttempt.updateMany({
        where: { alertId: a.id, targetUserId: actor.userId, acknowledgedAt: null },
        data: { acknowledgedAt: t },
      });
    }
    await logAlertEvent(tx, a.id, "REVIEWED", actor.userId, { note: `Decision: ${DECISION_LABEL[input.decision]}`, detail: note || null });

    const caseIds = new Set(await linkedOpenCaseIds(tx, a.id));
    if (input.decision !== "NO_ACTION_NEEDED") {
      caseIds.add(await ensureCaseForAlert(tx, actor, a, `Alert ${a.reference} reviewed: ${DECISION_LABEL[input.decision].toLowerCase()}`));
    }
    for (const caseId of caseIds) await markMilestone(tx, caseId, "REVIEWED", actor.userId, `Alert ${a.reference} reviewed`);
    if (input.decision === "CRISIS_PROTOCOL" && a.category !== "URGENT") {
      await raiseToUrgent(tx, actor, a, "Reviewer started the crisis protocol");
      // Urgent alerts need their own review decision before they can be closed.
      await tx.alert.update({ where: { id: a.id }, data: { status: "ACKNOWLEDGED" } });
    }
    await recordAudit(tx, actor, {
      action: "alert.review",
      entityType: "Alert",
      entityId: a.id,
      metadata: { decision: input.decision, feedback: input.feedback },
    });
    return { caseId: [...caseIds][0] ?? null };
  });
}

/** A person makes an alert urgent, which starts the crisis protocol notifications. */
export async function escalateAlert(actor: UserActor, alertId: string, reason: string): Promise<void> {
  assertCan(actor, "alert.review");
  const text = reason.trim();
  if (text.length < 10) fail("VALIDATION", "Say briefly why you are escalating.");
  await runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status === "CLOSED") fail("INVALID_TRANSITION", "This alert is closed.");
    if (a.category === "URGENT") fail("INVALID_TRANSITION", "This alert is already urgent. Record escalation attempts instead.");
    const t = now();
    await tx.alert.update({
      where: { id: a.id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: a.acknowledgedAt ?? t,
        acknowledgedById: a.acknowledgedById ?? actor.userId,
        assignedToId: a.assignedToId ?? actor.userId,
      },
    });
    await raiseToUrgent(tx, actor, a, "Escalated by a reviewer");
    await logAlertEvent(tx, a.id, "NOTE", actor.userId, { note: "Escalation reason recorded", detail: text });
    await recordAudit(tx, actor, { action: "alert.escalate", entityType: "Alert", entityId: a.id, metadata: { from: a.category } });
  });
}

/** Changes the category up (below urgent) or down, with a written reason. Lowering an urgent
 * alert needs a recorded review decision first. */
export async function recategorizeAlert(actor: UserActor, alertId: string, category: TriageCategory, reason: string): Promise<void> {
  assertCan(actor, "alert.review");
  const text = reason.trim();
  if (text.length < 10) fail("VALIDATION", "Explain the change in a sentence or two.");
  if (category === "ROUTINE") fail("VALIDATION", "Close the alert instead of setting it to routine.");
  if (category === "URGENT") fail("VALIDATION", "Use Escalate to make an alert urgent, so the crisis protocol starts.");
  await runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status === "CLOSED") fail("INVALID_TRANSITION", "This alert is closed.");
    if (category === a.category) fail("VALIDATION", "The alert is already in that category.");
    const lowering = CATEGORY_RANK[category] < CATEGORY_RANK[a.category];
    if (lowering && a.category === "URGENT" && a.status !== "REVIEWED") {
      fail("HUMAN_REVIEW_REQUIRED", "Record a review decision before lowering an urgent alert.");
    }
    const settings = await getInstitutionSettings(tx, a.institutionId);
    await tx.alert.update({
      where: { id: a.id },
      data: {
        category,
        title: retitle(a.title, category),
        recommendedAction: RECOMMENDED_ACTION[category],
        ...(a.status === "NEW" ? { slaDueAt: new Date(a.createdAt.getTime() + ackWindowMs(category, settings)) } : {}),
      },
    });
    await logAlertEvent(tx, a.id, "CATEGORY_CHANGED", actor.userId, { fromCategory: a.category, toCategory: category, detail: text });
    await recordAudit(tx, actor, { action: "alert.recategorize", entityType: "Alert", entityId: a.id, metadata: { from: a.category, to: category } });
  });
}

export type EscalationAttemptInput = {
  target: EscalationTarget;
  /** Required when target is ON_CALL. */
  targetUserId?: string | null;
  /** Required when target is EXTERNAL_SERVICE, e.g. "Campus security". */
  targetLabel?: string | null;
  channel: EscalationChannel;
  outcome: EscalationOutcome;
  note?: string | null;
};

/** Documents one attempt to reach someone under the crisis protocol (PRD E6). */
export async function recordEscalationAttempt(actor: UserActor, alertId: string, input: EscalationAttemptInput): Promise<void> {
  assertCan(actor, "alert.review");
  if (
    !ESCALATION_TARGETS.includes(input.target) ||
    !ESCALATION_CHANNELS.includes(input.channel) ||
    !ESCALATION_OUTCOMES.includes(input.outcome)
  ) {
    fail("VALIDATION", "Choose who you tried to reach, how, and what happened.");
  }
  await runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status === "CLOSED") fail("INVALID_TRANSITION", "This alert is closed.");
    let targetUserId: string | null = null;
    let targetLabel: string | null = null;
    if (input.target === "ON_CALL") {
      const responder = await tx.user.findFirst({
        where: { id: input.targetUserId ?? "", institutionId: a.institutionId, role: { in: ["COUNSELLOR", "CLINICIAN"] } },
        select: { id: true },
      });
      if (!responder) fail("VALIDATION", "Choose the responder you contacted.");
      targetUserId = responder.id;
    } else if (input.target === "STUDENT") {
      targetUserId = a.studentId;
      targetLabel = "Student";
    } else {
      targetLabel = input.targetLabel?.trim().slice(0, 120) || null;
      if (!targetLabel) fail("VALIDATION", "Name the service you contacted.");
    }
    const t = now();
    const reached = input.outcome === "REACHED" || input.outcome === "HANDED_OVER";
    await tx.escalationAttempt.create({
      data: {
        alertId: a.id,
        targetUserId,
        targetLabel,
        channel: input.channel,
        outcome: input.outcome,
        noteCt: encryptOptional(input.note?.slice(0, 2000)),
        recordedById: actor.userId,
        attemptedAt: t,
        acknowledgedAt: reached ? t : null,
      },
    });
    await logAlertEvent(tx, a.id, "ESCALATION_ATTEMPT", actor.userId, {
      note: `${TARGET_LABEL[input.target]} by ${CHANNEL_LABEL[input.channel].toLowerCase()}: ${OUTCOME_LABEL[input.outcome].toLowerCase()}`,
    });
    if (input.target === "STUDENT" && reached) {
      for (const caseId of await linkedOpenCaseIds(tx, a.id)) {
        await markMilestone(tx, caseId, "CONTACTED", actor.userId, "Student reached during escalation");
      }
    }
    await recordAudit(tx, actor, {
      action: "alert.escalation_attempt",
      entityType: "Alert",
      entityId: a.id,
      metadata: { target: input.target, channel: input.channel, outcome: input.outcome },
    });
  });
}

/** Closing needs a recorded review decision. Urgent alerts also need at least one contact or
 * escalation attempt recorded by a person and a written review note (PRD section 16). */
export async function closeAlert(actor: UserActor, alertId: string): Promise<void> {
  assertCan(actor, "alert.review");
  await runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    if (a.status === "CLOSED") fail("INVALID_TRANSITION", "This alert is already closed.");
    if (a.status !== "REVIEWED" || !a.decision) fail("HUMAN_REVIEW_REQUIRED", "Record a review decision before closing the alert.");
    if (a.category === "URGENT") {
      const documented = await tx.escalationAttempt.count({ where: { alertId: a.id, recordedById: { not: null } } });
      if (!documented) fail("HUMAN_REVIEW_REQUIRED", "Record at least one contact or escalation attempt before closing an urgent alert.");
      if (!a.decisionNoteCt) fail("HUMAN_REVIEW_REQUIRED", "Urgent alerts need a written review note before closing.");
    }
    const t = now();
    const closed = await tx.alert.updateMany({
      where: { id: a.id, status: "REVIEWED" },
      data: { status: "CLOSED", closedAt: t, closedById: actor.userId },
    });
    if (closed.count !== 1) fail("INVALID_TRANSITION", "The alert changed while you were closing it. Reload and try again.");
    await logAlertEvent(tx, a.id, "CLOSED", actor.userId);
    await recordAudit(tx, actor, { action: "alert.close", entityType: "Alert", entityId: a.id, metadata: { category: a.category, decision: a.decision } });
  });
}

export async function openCaseFromAlert(actor: UserActor, alertId: string): Promise<string> {
  assertCan(actor, "case.manage");
  return runTx(async (tx) => {
    const a = await alertInTenant(tx, actor, alertId);
    const caseId = await ensureCaseForAlert(tx, actor, a, `Case linked to alert ${a.reference}`);
    await logAlertEvent(tx, a.id, "CASE_LINKED", actor.userId);
    await recordAudit(tx, actor, { action: "alert.link_case", entityType: "Alert", entityId: a.id, metadata: { caseId } });
    return caseId;
  });
}
