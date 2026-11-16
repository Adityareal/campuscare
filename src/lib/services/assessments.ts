import type { Instrument, Locale } from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, now } from "@/lib/clock";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { instrumentFor, maxScore, scoreInstrument, type SeverityBand } from "@/lib/instruments";
import { evaluateAfterCommit, studentInTenant } from "@/lib/services/access";
import { hasConsent } from "@/lib/services/consent";
import { notify } from "@/lib/services/notifications";

export async function startSelfAssessment(actor: UserActor, instrument: Instrument): Promise<string> {
  assertCan(actor, "own.history.read");
  const institutionId = tenantOf(actor);
  if (!(await hasConsent(db, actor.userId, "CORE_PROCESSING"))) fail("CONSENT_REQUIRED", "Review your privacy choices first.");
  const open = await db.assessment.findFirst({ where: { studentId: actor.userId, institutionId, instrument, status: "ASSIGNED" } });
  if (open) return open.id;
  const def = instrumentFor(instrument);
  const a = await db.assessment.create({
    data: {
      institutionId,
      studentId: actor.userId,
      instrument,
      instrumentVersion: def.version,
      source: "SELF",
      requestedLocale: actor.locale,
      assignedAt: now(),
    },
  });
  return a.id;
}

/** A counsellor or clinician asks the student to complete a screen (PRD C5 "request further assessment"). */
export async function requestAssessment(actor: UserActor, studentId: string, instrument: Instrument, alertId?: string): Promise<string> {
  assertCan(actor, "assessment.request");
  const student = await studentInTenant(db, actor, studentId);
  const def = instrumentFor(instrument);
  return db.$transaction(async (tx) => {
    const existing = await tx.assessment.findFirst({ where: { studentId, institutionId: student.institutionId!, instrument, status: "ASSIGNED" } });
    const a =
      existing ??
      (await tx.assessment.create({
        data: {
          institutionId: student.institutionId!,
          studentId,
          instrument,
          instrumentVersion: def.version,
          source: "COUNSELLOR_REQUEST",
          requestedById: actor.userId,
          assignedAt: now(),
          dueAt: new Date(now().getTime() + 7 * DAY),
          requestedLocale: student.locale,
        },
      }));
    if (alertId) {
      const alert = await tx.alert.findFirst({ where: { id: alertId, institutionId: student.institutionId!, studentId } });
      if (alert) {
        await tx.alertEvent.create({
          data: { alertId, actorId: actor.userId, type: "ASSESSMENT_REQUESTED", note: def.name, createdAt: now() },
        });
      }
    }
    await notify(tx, studentId, "assessment_requested", { institutionId: student.institutionId, link: `/student/assessments/${a.id}` });
    await recordAudit(tx, actor, { action: "assessment.request", entityType: "Assessment", entityId: a.id, metadata: { instrument, studentId } });
    return a.id;
  });
}

export async function getOwnAssessment(actor: UserActor, id: string) {
  assertCan(actor, "own.history.read");
  const a = await db.assessment.findFirst({ where: { id, studentId: actor.userId, institutionId: tenantOf(actor) }, include: { score: true } });
  if (!a) fail("NOT_FOUND", "Questionnaire not found.");
  return a;
}

export type SubmittedResult = {
  total: number;
  max: number;
  band: SeverityBand;
  safetyItemPositive: boolean;
  careTeamReview: boolean;
};

export async function submitAssessment(
  actor: UserActor,
  id: string,
  responses: number[],
  functionalDifficulty: number | null,
): Promise<SubmittedResult> {
  assertCan(actor, "own.history.read");
  const institutionId = tenantOf(actor);
  const a = await db.assessment.findFirst({ where: { id, studentId: actor.userId, institutionId } });
  if (!a) fail("NOT_FOUND", "Questionnaire not found.");
  if (a.status !== "ASSIGNED") fail("INVALID_TRANSITION", "This questionnaire was already submitted.");
  const def = instrumentFor(a.instrument);
  const score = scoreInstrument(def, responses, functionalDifficulty);
  const displayed: Locale = def.validatedLocales.includes(actor.locale) ? actor.locale : "en";

  await db.$transaction(async (tx) => {
    const t = now();
    // Compare-and-swap so a double submit cannot store two score sets.
    const claimed = await tx.assessment.updateMany({
      where: { id, status: "ASSIGNED" },
      data: { status: "COMPLETED", completedAt: t, displayedLocale: displayed },
    });
    if (claimed.count !== 1) fail("INVALID_TRANSITION", "This questionnaire was already submitted.");
    await tx.assessmentResponse.createMany({ data: responses.map((value, i) => ({ assessmentId: id, itemNumber: i + 1, value })) });
    await tx.assessmentScore.create({
      data: {
        assessmentId: id,
        total: score.total,
        band: score.band,
        safetyItemPositive: score.safetyItemPositive,
        functionalDifficulty: score.functionalDifficulty,
        scoringVersion: score.scoringVersion,
        computedAt: t,
      },
    });
    await recordAudit(tx, actor, { action: "assessment.submit", entityType: "Assessment", entityId: id, metadata: { instrument: a.instrument } });
  });
  await evaluateAfterCommit(actor.userId, institutionId, "assessment");
  return {
    total: score.total,
    max: maxScore(def),
    band: score.band,
    safetyItemPositive: score.safetyItemPositive,
    careTeamReview: await hasConsent(db, actor.userId, "CARE_TEAM_REVIEW"),
  };
}

export async function listOwnAssessments(actor: UserActor) {
  assertCan(actor, "own.history.read");
  return db.assessment.findMany({
    where: { studentId: actor.userId, institutionId: tenantOf(actor) },
    include: { score: true },
    orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
    take: 40,
  });
}
