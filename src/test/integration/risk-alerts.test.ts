import "@/test/env";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { advanceClock, DAY, setClock } from "@/lib/clock";
import { startSelfAssessment, submitAssessment } from "@/lib/services/assessments";
import { submitCheckIn, type CheckInInput } from "@/lib/services/checkins";
import { requestHelp } from "@/lib/services/help";
import { evaluateStudentRisk } from "@/lib/services/risk";
import { actorFor, createTestDb, grantConsent, makeInstitution, makeUser, TEST_START, type TestDb } from "@/test/db";

const highStress: CheckInInput = {
  mood: null,
  stress: 5,
  sleep: null,
  energy: null,
  social: null,
  academicPressure: null,
  wantsToTalk: "NO",
  note: null,
};

let t: TestDb;
let institutionId: string;
let counsellorId: string;

beforeAll(async () => {
  t = await createTestDb();
  setClock(TEST_START);
  institutionId = (await makeInstitution()).id;
  counsellorId = (await makeUser("COUNSELLOR", institutionId)).id;
});
afterAll(async () => {
  setClock(null);
  await t.close();
});
beforeEach(() => setClock(TEST_START));
afterEach(() => setClock(null));

/** The risk engine swallows its own failures (and audits them) so a submission is never lost;
 * a test that expects no alert must also prove the engine actually ran cleanly. */
async function expectNoEvaluationFailures(): Promise<void> {
  expect(await t.db.auditLog.count({ where: { action: "risk.evaluation_failed" } })).toBe(0);
}

async function threeHighStressCheckIns(studentId: string): Promise<void> {
  const student = await t.db.user.findUniqueOrThrow({ where: { id: studentId } });
  for (let i = 0; i < 3; i++) {
    await submitCheckIn(actorFor(student), highStress);
    advanceClock(DAY);
  }
}

describe("sustained high stress", () => {
  it("creates a MONITOR alert when care-team review is granted", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING", "CARE_TEAM_REVIEW"]);
    await threeHighStressCheckIns(student.id);

    const alerts = await t.db.alert.findMany({ where: { studentId: student.id }, include: { indicators: true } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.category).toBe("MONITOR");
    expect(alerts[0]?.status).toBe("NEW");
    expect(alerts[0]?.indicators.map((i) => i.ruleCode)).toEqual(["SUSTAINED_HIGH_STRESS"]);
    // A monitor alert alone does not open a case.
    expect(await t.db.case.count({ where: { studentId: student.id } })).toBe(0);
    expect(await t.db.notification.count({ where: { userId: counsellorId, template: "staff_alert_new" } })).toBeGreaterThan(0);
    await expectNoEvaluationFailures();
  });

  it("creates nothing without care-team review consent", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    await threeHighStressCheckIns(student.id);
    expect(await t.db.checkIn.count({ where: { studentId: student.id } })).toBe(3);
    expect(await t.db.alert.count({ where: { studentId: student.id } })).toBe(0);
    await expectNoEvaluationFailures();
  });

  it("does not duplicate the pattern on the open alert when it continues", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING", "CARE_TEAM_REVIEW"]);
    await threeHighStressCheckIns(student.id);
    await submitCheckIn(actorFor(student), highStress);
    const alerts = await t.db.alert.findMany({ where: { studentId: student.id }, include: { indicators: true } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.indicators).toHaveLength(1);
  });
});

describe("PHQ-9 question 9", () => {
  it("creates an URGENT alert linked to a case with an automated escalation attempt, once", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING", "CARE_TEAM_REVIEW"]);
    const actor = actorFor(student);
    const id = await startSelfAssessment(actor, "PHQ9");
    const result = await submitAssessment(actor, id, [0, 0, 0, 0, 0, 0, 0, 0, 1], null);
    expect(result.safetyItemPositive).toBe(true);
    expect(result.band).toBe("MINIMAL");

    const alerts = await t.db.alert.findMany({
      where: { studentId: student.id },
      include: { indicators: true, escalations: true, cases: { include: { case: true } } },
    });
    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;
    expect(alert.category).toBe("URGENT");
    expect(alert.indicators.map((i) => i.ruleCode)).toEqual(["PHQ9_SAFETY_ITEM"]);
    expect(alert.escalatedAt?.toISOString()).toBe(TEST_START.toISOString());
    expect(alert.slaDueAt.getTime() - alert.createdAt.getTime()).toBe(15 * 60_000);

    expect(alert.cases).toHaveLength(1);
    expect(alert.cases[0]?.case.priority).toBe("URGENT");
    expect(alert.cases[0]?.case.source).toBe("ALERT");

    expect(alert.escalations).toHaveLength(1);
    expect(alert.escalations[0]?.targetUserId).toBe(counsellorId);
    expect(alert.escalations[0]?.recordedById).toBeNull();
    expect(await t.db.notification.count({ where: { userId: counsellorId, template: "staff_alert_urgent", link: `/counsellor/alerts/${alert.id}` } })).toBeGreaterThan(0);

    // Re-evaluating later finds the same answer and must not raise it again.
    advanceClock(DAY);
    const again = await evaluateStudentRisk(student.id, institutionId);
    expect(again.plan.action).toBe("none");
    expect(again.created).toBe(false);
    expect(await t.db.alert.count({ where: { studentId: student.id } })).toBe(1);
    expect(await t.db.riskIndicator.count({ where: { studentId: student.id } })).toBe(1);
    expect(await t.db.escalationAttempt.count({ where: { alertId: alert.id } })).toBe(1);
    await expectNoEvaluationFailures();
  });

  it("is not evaluated without care-team review consent", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    const actor = actorFor(student);
    const id = await startSelfAssessment(actor, "PHQ9");
    const result = await submitAssessment(actor, id, [0, 0, 0, 0, 0, 0, 0, 0, 2], null);
    expect(result.careTeamReview).toBe(false);
    expect(await t.db.alert.count({ where: { studentId: student.id } })).toBe(0);
    await expectNoEvaluationFailures();
  });
});

describe("urgent help requests", () => {
  it("create a case and an URGENT alert even without care-team consent", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    const r = await requestHelp(actorFor(student), { type: "URGENT_SUPPORT", details: "Please call me tonight" });
    expect(r.urgent).toBe(true);

    const kase = await t.db.case.findUniqueOrThrow({ where: { id: r.caseId }, include: { alerts: true, helpRequests: true } });
    expect(kase.source).toBe("HELP_REQUEST");
    expect(kase.priority).toBe("URGENT");
    expect(kase.helpRequests).toHaveLength(1);
    expect(kase.helpRequests[0]?.detailsCt).not.toContain("call me");

    const alerts = await t.db.alert.findMany({ where: { studentId: student.id }, include: { indicators: true, escalations: true } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.category).toBe("URGENT");
    expect(alerts[0]?.indicators.map((i) => i.ruleCode)).toEqual(["URGENT_HELP_REQUEST"]);
    expect(alerts[0]?.escalations.length).toBeGreaterThan(0);
    expect(kase.alerts.map((a) => a.alertId)).toEqual([alerts[0]?.id]);
    expect(await t.db.notification.count({ where: { userId: student.id, template: "help_received" } })).toBe(1);
    await expectNoEvaluationFailures();
  });
});
