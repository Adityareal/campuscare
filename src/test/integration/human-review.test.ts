import "@/test/env";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "@/lib/actor";
import { DAY, now, setClock } from "@/lib/clock";
import { shortReference } from "@/lib/crypto";
import { acknowledgeAlert, closeAlert, recordEscalationAttempt, reviewAlert } from "@/lib/services/alerts";
import { closeCase, documentOutcome, linkAlertToCase } from "@/lib/services/cases";
import { requestHelp } from "@/lib/services/help";
import { actorFor, createTestDb, grantConsent, makeInstitution, makeUser, TEST_START, type TestDb } from "@/test/db";
import { expectDomainError } from "@/test/expect";

let t: TestDb;
let institutionId: string;
let counsellor: UserActor;

beforeAll(async () => {
  t = await createTestDb();
  setClock(TEST_START);
  institutionId = (await makeInstitution()).id;
  counsellor = actorFor(await makeUser("COUNSELLOR", institutionId));
});
afterAll(async () => {
  setClock(null);
  await t.close();
});
beforeEach(() => setClock(TEST_START));
afterEach(() => setClock(null));

/** An urgent alert raised by the rules from a student's urgent help request. */
async function urgentAlert(): Promise<{ alertId: string; caseId: string; studentId: string }> {
  const student = await makeUser("STUDENT", institutionId);
  await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
  const { caseId } = await requestHelp(actorFor(student), { type: "URGENT_SUPPORT" });
  const alert = await t.db.alert.findFirstOrThrow({ where: { studentId: student.id, category: "URGENT" } });
  return { alertId: alert.id, caseId, studentId: student.id };
}

describe("closeAlert", () => {
  it("needs a review, a human-recorded attempt and a written note before an urgent alert closes", async () => {
    const { alertId } = await urgentAlert();

    const notReviewed = await expectDomainError(closeAlert(counsellor, alertId), "HUMAN_REVIEW_REQUIRED");
    expect(notReviewed.message).toMatch(/review decision/);

    await acknowledgeAlert(counsellor, alertId);
    await expectDomainError(closeAlert(counsellor, alertId), "HUMAN_REVIEW_REQUIRED");

    await reviewAlert(counsellor, alertId, {
      decision: "CRISIS_PROTOCOL",
      feedback: "APPROPRIATE",
      note: "Followed the crisis protocol and agreed a safety plan with the student.",
    });
    // The automated escalation attempt does not count as a human contact attempt.
    const noAttempt = await expectDomainError(closeAlert(counsellor, alertId), "HUMAN_REVIEW_REQUIRED");
    expect(noAttempt.message).toMatch(/contact or escalation attempt/);

    await recordEscalationAttempt(counsellor, alertId, { target: "STUDENT", channel: "PHONE", outcome: "REACHED", note: "Spoke for twenty minutes." });

    // Remove the review note directly to prove closeAlert checks it independently.
    const reviewed = await t.db.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(reviewed.decisionNoteCt).toBeTruthy();
    await t.db.alert.update({ where: { id: alertId }, data: { decisionNoteCt: null } });
    const noNote = await expectDomainError(closeAlert(counsellor, alertId), "HUMAN_REVIEW_REQUIRED");
    expect(noNote.message).toMatch(/written review note/);
    await t.db.alert.update({ where: { id: alertId }, data: { decisionNoteCt: reviewed.decisionNoteCt } });

    await closeAlert(counsellor, alertId);
    const closed = await t.db.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedById).toBe(counsellor.userId);
    expect(closed.closedAt?.toISOString()).toBe(TEST_START.toISOString());
    await expectDomainError(closeAlert(counsellor, alertId), "INVALID_TRANSITION");
  });

  it("an urgent review needs a written note", async () => {
    const { alertId } = await urgentAlert();
    await expectDomainError(reviewAlert(counsellor, alertId, { decision: "OUTREACH", feedback: null, note: "" }), "VALIDATION");
  });

  it("a system actor gets FORBIDDEN from acknowledgeAlert and closeAlert", async () => {
    const { alertId } = await urgentAlert();
    const engine = systemActor("risk-engine", institutionId) as unknown as UserActor;
    const scheduler = systemActor("scheduler", institutionId) as unknown as UserActor;
    await expectDomainError(acknowledgeAlert(engine, alertId), "FORBIDDEN");
    await expectDomainError(closeAlert(engine, alertId), "FORBIDDEN");
    await expectDomainError(closeAlert(scheduler, alertId), "FORBIDDEN");
    await expectDomainError(closeCase(engine, (await t.db.caseAlert.findFirstOrThrow({ where: { alertId } })).caseId), "FORBIDDEN");
    const alert = await t.db.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alert.status).toBe("NEW");
  });

  it("students and administrators cannot review alerts", async () => {
    const { alertId, studentId } = await urgentAlert();
    const student = actorFor(await t.db.user.findUniqueOrThrow({ where: { id: studentId } }));
    const admin = actorFor(await makeUser("INSTITUTION_ADMIN", institutionId));
    await expectDomainError(acknowledgeAlert(student, alertId), "FORBIDDEN");
    await expectDomainError(acknowledgeAlert(admin, alertId), "FORBIDDEN");
  });
});

describe("closeCase", () => {
  it("refuses without an outcome, with an open linked alert or with a scheduled follow-up", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    const { caseId } = await requestHelp(actorFor(student), { type: "GENERAL_SUPPORT" });

    const noOutcome = await expectDomainError(closeCase(counsellor, caseId), "INVALID_TRANSITION");
    expect(noOutcome.message).toMatch(/outcome/);
    await documentOutcome(counsellor, caseId, "Met the student twice and agreed a study plan.");

    const t0 = now();
    const alert = await t.db.alert.create({
      data: {
        institutionId,
        reference: shortReference("A"),
        studentId: student.id,
        category: "MONITOR",
        title: "Monitor: test alert",
        recommendedAction: "Review the evidence.",
        createdAt: t0,
        slaDueAt: new Date(t0.getTime() + 3 * DAY),
      },
    });
    await linkAlertToCase(t.db, caseId, alert.id);
    await expectDomainError(closeCase(counsellor, caseId), "HUMAN_REVIEW_REQUIRED");
    await t.db.alert.update({ where: { id: alert.id }, data: { status: "CLOSED", closedAt: t0, closedById: counsellor.userId } });

    const followUp = await t.db.followUp.create({
      data: {
        institutionId,
        caseId,
        studentId: student.id,
        assignedToId: counsellor.userId,
        kind: "CHECK_IN_CALL",
        dueAt: new Date(t0.getTime() + 7 * DAY),
        createdById: counsellor.userId,
        createdAt: t0,
      },
    });
    const pending = await expectDomainError(closeCase(counsellor, caseId), "INVALID_TRANSITION");
    expect(pending.message).toMatch(/follow-up/);
    await t.db.followUp.update({ where: { id: followUp.id }, data: { status: "DONE", completedAt: t0 } });

    await closeCase(counsellor, caseId);
    const closed = await t.db.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt?.toISOString()).toBe(TEST_START.toISOString());
  });
});
