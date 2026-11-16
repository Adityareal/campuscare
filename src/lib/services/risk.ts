import type { Prisma } from "@/generated/prisma/client";
import type { TriageCategory } from "@/generated/prisma/enums";
import { systemActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { DAY, now } from "@/lib/clock";
import { shortReference } from "@/lib/crypto";
import { db, type DbLike } from "@/lib/db";
import type { SeverityBand } from "@/lib/instruments";
import { alertTitle, evaluateRisk, planAlertUpdate, RECOMMENDED_ACTION, type AlertPlan } from "@/lib/risk/engine";
import { CATEGORY_RANK } from "@/lib/risk/rules";
import { ensureOpenCase, linkAlertToCase, OPEN_CASE_STATUSES } from "@/lib/services/cases";
import { ackWindowMs, getInstitutionSettings, type InstitutionSettings } from "@/lib/services/config";
import { hasConsent } from "@/lib/services/consent";
import { careTeamIds, notify } from "@/lib/services/notifications";

export type RiskOutcome = {
  plan: AlertPlan;
  alertId: string | null;
  created: boolean;
  becameUrgent: boolean;
};

/**
 * Runs the rules for one student at time `at` and records the result. It only ever creates
 * alerts, attaches evidence or raises a category. Closing and lowering are human-only actions
 * (see services/alerts.ts); nothing in this file can do either.
 */
export async function evaluateStudentRisk(studentId: string, institutionId: string, at: Date = now()): Promise<RiskOutcome> {
  return db.$transaction((tx) => evaluateStudentRiskIn(tx, studentId, institutionId, at));
}

export async function evaluateStudentRiskIn(client: DbLike, studentId: string, institutionId: string, at: Date): Promise<RiskOutcome> {
  const settings = await getInstitutionSettings(client, institutionId);
  const rules = settings.rules;
  const includePatterns = await hasConsent(client, studentId, "CARE_TEAM_REVIEW");
  const scope = { studentId, institutionId };
  const since = (days: number) => new Date(at.getTime() - days * DAY);

  const checkIns = includePatterns
    ? await client.checkIn.findMany({
        where: { ...scope, createdAt: { gte: since(rules.checkInLookbackDays), lte: at } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const assessments = includePatterns
    ? await client.assessment.findMany({
        where: { ...scope, status: "COMPLETED", completedAt: { gte: since(180), lte: at } },
        include: { score: true },
        orderBy: { completedAt: "asc" },
      })
    : [];
  const helpRequests = await client.helpRequest.findMany({
    where: { ...scope, createdAt: { gte: since(60), lte: at } },
    orderBy: { createdAt: "asc" },
  });

  const evaluation = evaluateRisk({
    now: at,
    rules,
    includePatterns,
    checkIns: checkIns.map((c) => ({
      id: c.id,
      at: c.createdAt,
      mood: c.mood,
      stress: c.stress,
      sleep: c.sleep,
      energy: c.energy,
      social: c.social,
      academicPressure: c.academicPressure,
    })),
    assessments: assessments.flatMap((a) =>
      a.score && a.completedAt
        ? [
            {
              id: a.id,
              at: a.completedAt,
              instrument: a.instrument,
              total: a.score.total,
              band: a.score.band as SeverityBand,
              safetyItemPositive: a.score.safetyItemPositive,
            },
          ]
        : [],
    ),
    helpRequests: helpRequests.map((h) => ({ id: h.id, at: h.createdAt, type: h.type })),
  });

  const open = await client.alert.findFirst({
    where: { ...scope, status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
    include: { indicators: { select: { ruleCode: true } } },
  });
  const seen = await client.riskIndicator.findMany({
    where: { studentId, dedupeKey: { in: evaluation.findings.map((f) => f.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const closed = await client.riskIndicator.findMany({
    where: { studentId, alert: { status: "CLOSED", closedAt: { gte: since(rules.closedCooldownDays) } } },
    select: { ruleCode: true, alert: { select: { category: true, closedAt: true } } },
  });

  const plan = planAlertUpdate(
    evaluation.findings,
    {
      open: open ? { id: open.id, category: open.category, ruleCodes: new Set(open.indicators.map((i) => i.ruleCode)) } : null,
      seenDedupeKeys: new Set(seen.map((s) => s.dedupeKey)),
      recentlyClosed: closed.map((c) => ({ ruleCode: c.ruleCode, category: c.alert.category, closedAt: c.alert.closedAt ?? at })),
    },
    at,
    rules.closedCooldownDays,
  );

  if (plan.action === "none") return { plan, alertId: open?.id ?? null, created: false, becameUrgent: false };

  const engine = systemActor("risk-engine", institutionId);
  const indicatorRows = (alertId: string): Prisma.RiskIndicatorCreateManyInput[] =>
    plan.findings.map((f) => ({
      institutionId,
      studentId,
      alertId,
      ruleCode: f.ruleCode,
      ruleVersion: f.ruleVersion,
      dedupeKey: f.dedupeKey,
      domain: f.domain,
      category: f.category,
      explanation: f.explanation,
      evidence: f.evidence as unknown as Prisma.InputJsonValue,
      createdAt: at,
    }));

  let alertId: string;
  let reference: string;
  let becameUrgent = false;
  if (plan.action === "create") {
    const alert = await client.alert.create({
      data: {
        institutionId,
        studentId,
        reference: shortReference("A"),
        category: plan.category,
        title: alertTitle(plan.category, plan.findings),
        recommendedAction: RECOMMENDED_ACTION[plan.category],
        createdAt: at,
        slaDueAt: new Date(at.getTime() + ackWindowMs(plan.category, settings)),
        events: {
          create: {
            type: "CREATED",
            toCategory: plan.category,
            note: `${plan.findings.length} finding(s) from triage rules v${rules.version}`,
            createdAt: at,
          },
        },
      },
    });
    alertId = alert.id;
    reference = alert.reference;
    await client.riskIndicator.createMany({ data: indicatorRows(alertId) });
    becameUrgent = plan.category === "URGENT";
    await recordAudit(client, engine, {
      action: "alert.create",
      entityType: "Alert",
      entityId: alertId,
      metadata: { category: plan.category, findings: plan.findings.length },
    });
  } else {
    const current = open!;
    alertId = current.id;
    reference = current.reference;
    await client.riskIndicator.createMany({ data: indicatorRows(alertId) });
    await client.alertEvent.create({
      data: { alertId, type: "EVIDENCE_ADDED", note: plan.findings.map((f) => f.ruleCode).join(", "), createdAt: at },
    });
    if (plan.raisedTo) {
      await client.alert.update({
        where: { id: alertId },
        data: {
          category: plan.raisedTo,
          // The finding that caused the raise is always among the new findings.
          title: alertTitle(plan.raisedTo, plan.findings),
          recommendedAction: RECOMMENDED_ACTION[plan.raisedTo],
          slaDueAt: new Date(Math.min(current.slaDueAt.getTime(), at.getTime() + ackWindowMs(plan.raisedTo, settings))),
          // A raised alert needs fresh human acknowledgement and a fresh review decision, even if
          // an earlier version was reviewed. The event history keeps the earlier actions.
          status: "NEW",
        },
      });
      await client.alertEvent.create({
        data: { alertId, type: "CATEGORY_RAISED", fromCategory: current.category, toCategory: plan.raisedTo, createdAt: at },
      });
      becameUrgent = plan.raisedTo === "URGENT";
    }
    await recordAudit(client, engine, {
      action: "alert.evidence_added",
      entityType: "Alert",
      entityId: alertId,
      metadata: { findings: plan.findings.length, raisedTo: plan.raisedTo },
    });
  }

  // Link to the student's open case so whoever holds it sees the new evidence. Urgent alerts
  // always get a case, because the crisis protocol is tracked there until a person closes it.
  const openCase = await client.case.findFirst({
    where: { institutionId, studentId, status: { in: [...OPEN_CASE_STATUSES] } },
    select: { id: true },
  });
  if (openCase || CATEGORY_RANK[plan.category] >= CATEGORY_RANK.URGENT) {
    const { caseId } = await ensureOpenCase(client, {
      institutionId,
      studentId,
      priority: plan.category,
      source: "ALERT",
      actorId: null,
      summary: plan.action === "create" ? `Early-warning alert ${reference} raised` : `New evidence added to alert ${reference}`,
    });
    await linkAlertToCase(client, caseId, alertId);
  }

  const team = await careTeamIds(client, institutionId, ["COUNSELLOR"]);
  if (becameUrgent) {
    await startEscalation(client, alertId, settings, team, at);
  } else {
    await notify(client, team, "staff_alert_new", { institutionId, link: `/counsellor/alerts/${alertId}` });
  }
  return { plan, alertId, created: plan.action === "create", becameUrgent };
}

/** Urgent alerts go to the designated on-call responder first, then to the whole care team.
 * This automated notification is recorded as an attempt without a human recorder; closing an
 * urgent alert still needs at least one attempt recorded by a person. */
export async function startEscalation(
  client: DbLike,
  alertId: string,
  settings: InstitutionSettings,
  team: string[],
  at: Date = now(),
): Promise<void> {
  const target = settings.onCallResponderId ?? team[0] ?? null;
  if (target) {
    await client.escalationAttempt.create({
      data: { alertId, targetUserId: target, channel: "IN_APP", outcome: "NOTIFIED", attemptedAt: at },
    });
  }
  await client.alert.update({ where: { id: alertId }, data: { escalatedAt: at } });
  await client.alertEvent.create({
    data: {
      alertId,
      type: "ESCALATED",
      toCategory: "URGENT",
      note: target ? "On-call responder notified" : "No on-call responder configured; whole care team notified",
      createdAt: at,
    },
  });
  await notify(client, [...(target ? [target] : []), ...team], "staff_alert_urgent", {
    institutionId: settings.institutionId,
    link: `/counsellor/alerts/${alertId}`,
  });
}

/** Re-notifies the care team about urgent alerts nobody has acknowledged within the window.
 * Called by the scheduled tick. Never changes an alert's status or category. */
export async function escalateOverdueUrgentAlerts(institutionId: string, at: Date = now()): Promise<number> {
  return db.$transaction(async (tx) => {
    const overdue = await tx.alert.findMany({
      where: { institutionId, category: "URGENT", status: "NEW", slaDueAt: { lt: at } },
      include: { escalations: { orderBy: { attemptedAt: "desc" }, take: 1 } },
    });
    if (overdue.length === 0) return 0;
    const settings = await getInstitutionSettings(tx, institutionId);
    const team = await careTeamIds(tx, institutionId, ["COUNSELLOR", "CLINICIAN"]);
    let count = 0;
    for (const a of overdue) {
      const last = a.escalations[0];
      // Re-escalate at most once per acknowledgement window.
      if (last && at.getTime() - last.attemptedAt.getTime() < ackWindowMs("URGENT", settings)) continue;
      const backup = team.find((id) => id !== last?.targetUserId) ?? last?.targetUserId ?? null;
      if (backup) {
        await tx.escalationAttempt.create({
          data: { alertId: a.id, targetUserId: backup, channel: "IN_APP", outcome: "RE_ESCALATED", attemptedAt: at },
        });
      }
      await tx.alertEvent.create({
        data: { alertId: a.id, type: "ESCALATED", note: "Not acknowledged within the urgent window", createdAt: at },
      });
      await notify(tx, team, "staff_escalation_overdue", { institutionId, link: `/counsellor/alerts/${a.id}` });
      await recordAudit(tx, systemActor("scheduler", institutionId), { action: "alert.re_escalate", entityType: "Alert", entityId: a.id });
      count += 1;
    }
    return count;
  });
}

export function categoryIsAtLeast(c: TriageCategory, min: TriageCategory): boolean {
  return CATEGORY_RANK[c] >= CATEGORY_RANK[min];
}
