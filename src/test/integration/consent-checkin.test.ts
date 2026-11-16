import "@/test/env";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { advanceClock, MINUTE, setClock } from "@/lib/clock";
import { decryptField } from "@/lib/crypto";
import { getConsentState, recordConsentChoices } from "@/lib/services/consent";
import { submitCheckIn, type CheckInInput } from "@/lib/services/checkins";
import { actorFor, createTestDb, grantConsent, makeInstitution, makeUser, TEST_START, type TestDb } from "@/test/db";
import { expectDomainError } from "@/test/expect";

const EMPTY_CHECK_IN: CheckInInput = {
  mood: null,
  stress: null,
  sleep: null,
  energy: null,
  social: null,
  academicPressure: null,
  wantsToTalk: null,
  note: null,
};

let t: TestDb;
let institutionId: string;

beforeAll(async () => {
  t = await createTestDb();
  setClock(TEST_START);
  institutionId = (await makeInstitution()).id;
});
afterAll(async () => {
  setClock(null);
  await t.close();
});
beforeEach(() => setClock(TEST_START));
afterEach(() => setClock(null));

describe("consent records", () => {
  it("are append-only: the database rejects an UPDATE", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    await expect(t.db.consentRecord.updateMany({ where: { userId: student.id }, data: { decision: "WITHDRAWN" } })).rejects.toThrow();
    await expect(
      t.pg.query(`UPDATE "ConsentRecord" SET "decision" = 'WITHDRAWN' WHERE "userId" = $1`, [student.id]),
    ).rejects.toThrow(/append-only/);
    const rows = await t.db.consentRecord.findMany({ where: { userId: student.id } });
    expect(rows.map((r) => r.decision)).toEqual(["GRANTED"]);
  });

  it("getConsentState follows the latest row per scope", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING", "CARE_TEAM_REVIEW"]);
    expect((await getConsentState(t.db, student.id)).CARE_TEAM_REVIEW).toBe(true);

    advanceClock(MINUTE);
    await grantConsent(student.id, institutionId, ["CARE_TEAM_REVIEW"], "WITHDRAWN");
    let state = await getConsentState(t.db, student.id);
    expect(state.CORE_PROCESSING).toBe(true);
    expect(state.CARE_TEAM_REVIEW).toBe(false);
    expect(state.AGGREGATE_ANALYTICS).toBe(false);
    expect(state.needsReview).toBe(false);

    advanceClock(MINUTE);
    await grantConsent(student.id, institutionId, ["CARE_TEAM_REVIEW"]);
    state = await getConsentState(t.db, student.id);
    expect(state.CARE_TEAM_REVIEW).toBe(true);
    expect(state.lastChangedAt?.toISOString()).toBe(new Date(TEST_START.getTime() + 2 * MINUTE).toISOString());
    expect(await t.db.consentRecord.count({ where: { userId: student.id } })).toBe(4);
  });

  it("a student with no records needs to review the policy", async () => {
    const student = await makeUser("STUDENT", institutionId);
    const state = await getConsentState(t.db, student.id);
    expect(state.needsReview).toBe(true);
    expect(state.CORE_PROCESSING).toBe(false);
  });

  it("recordConsentChoices appends rows only for changed scopes", async () => {
    const student = await makeUser("STUDENT", institutionId);
    const actor = actorFor(student);
    await recordConsentChoices(actor, { CORE_PROCESSING: true, CARE_TEAM_REVIEW: true, AGGREGATE_ANALYTICS: false }, "onboarding", "en");
    expect(await t.db.consentRecord.count({ where: { userId: student.id } })).toBe(3);
    advanceClock(MINUTE);
    const state = await recordConsentChoices(actor, { CORE_PROCESSING: true, CARE_TEAM_REVIEW: false, AGGREGATE_ANALYTICS: false }, "privacy_settings", "en");
    expect(state.CARE_TEAM_REVIEW).toBe(false);
    expect(await t.db.consentRecord.count({ where: { userId: student.id } })).toBe(4);
  });
});

describe("check-ins", () => {
  it("submitCheckIn requires core consent", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await expectDomainError(submitCheckIn(actorFor(student), { ...EMPTY_CHECK_IN, mood: 3 }), "CONSENT_REQUIRED");
    expect(await t.db.checkIn.count({ where: { studentId: student.id } })).toBe(0);

    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    const r = await submitCheckIn(actorFor(student), { ...EMPTY_CHECK_IN, mood: 3 });
    expect(r.requestedContact).toBe(false);
    expect(await t.db.checkIn.count({ where: { studentId: student.id } })).toBe(1);
  });

  it("a withdrawn core consent blocks new check-ins", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    advanceClock(MINUTE);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"], "WITHDRAWN");
    await expectDomainError(submitCheckIn(actorFor(student), { ...EMPTY_CHECK_IN, stress: 2 }), "CONSENT_REQUIRED");
  });

  it("rejects an empty or out-of-range check-in", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    await expectDomainError(submitCheckIn(actorFor(student), EMPTY_CHECK_IN), "VALIDATION");
    await expectDomainError(submitCheckIn(actorFor(student), { ...EMPTY_CHECK_IN, mood: 6 }), "VALIDATION");
  });

  it("stores the note encrypted, never as plain text", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    const note = "Worried about the chemistry exam on Friday";
    const { checkInId } = await submitCheckIn(actorFor(student), { ...EMPTY_CHECK_IN, mood: 2, note });
    const row = await t.db.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
    expect(row.noteCiphertext).toBeTruthy();
    expect(row.noteCiphertext).not.toContain(note);
    expect(row.noteCiphertext).not.toContain("chemistry");
    expect(row.noteCiphertext!.startsWith("v1.")).toBe(true);
    expect(decryptField(row.noteCiphertext!)).toBe(note);
    expect(row.createdAt.toISOString()).toBe(TEST_START.toISOString());

    const audit = await t.db.auditLog.findMany({ where: { entityId: checkInId } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]?.metadata ?? null)).not.toContain("chemistry");
  });

  it("asking to talk opens a help request and a case", async () => {
    const student = await makeUser("STUDENT", institutionId);
    await grantConsent(student.id, institutionId, ["CORE_PROCESSING"]);
    const r = await submitCheckIn(actorFor(student), { ...EMPTY_CHECK_IN, mood: 2, wantsToTalk: "YES" });
    expect(r.requestedContact).toBe(true);
    const request = await t.db.helpRequest.findFirstOrThrow({ where: { studentId: student.id } });
    expect(request.origin).toBe("check_in");
    expect(request.caseId).toBeTruthy();
  });
});
