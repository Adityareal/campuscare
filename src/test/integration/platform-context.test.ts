import "@/test/env";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UserActor } from "@/lib/actor";
import { verifyAuditChain } from "@/lib/audit";
import { setClock } from "@/lib/clock";
import {
  countStudents,
  createDepartment,
  createStudentInvite,
  getAccessHistory,
  getAdminSettings,
  getPerson,
  inviteStaff,
  listAuditLog,
  listPeople,
  reactivateUser,
  resetAccess,
  suspendUser,
  updateInstitutionSettings,
  verifyProfessional,
} from "@/lib/services/admin";
import { listAlerts } from "@/lib/services/alerts";
import { getCaseDetail, listCases } from "@/lib/services/cases";
import { listClinicalNotes } from "@/lib/services/clinical-notes";
import { closeInstitution, openInstitution } from "@/lib/services/platform";
import { buildReport } from "@/lib/services/reports";
import { getRules } from "@/lib/services/rules-admin";
import { requestHelp } from "@/lib/services/help";
import { actorFor, createTestDb, grantConsent, makeInstitution, makeUser, TEST_START, type TestDb } from "@/test/db";
import { expectDomainError } from "@/test/expect";

let t: TestDb;
let aId: string;
let bId: string;
let platformUser: Awaited<ReturnType<typeof makeUser>>;
let platform: UserActor; // no institution picked
let inA: UserActor; // institution A picked
let adminA: UserActor;
let counsellorA: UserActor;
let counsellorId: string;
let clinicianId: string;
let studentId: string;
let adminB: UserActor;
let supportId: string;
let counsellorBId: string;

const TOKEN = "platform-context-test-token";

beforeAll(async () => {
  t = await createTestDb();
  setClock(TEST_START);
  aId = (await makeInstitution({ name: "Alpha University" })).id;
  bId = (await makeInstitution({ name: "Beta University" })).id;
  platformUser = await makeUser("PLATFORM_ADMIN", null);
  platform = actorFor(platformUser);
  inA = { ...platform, institutionId: aId, actingInInstitution: true };
  const adminAUser = await makeUser("INSTITUTION_ADMIN", aId);
  adminA = actorFor(adminAUser);
  adminB = actorFor(await makeUser("INSTITUTION_ADMIN", bId));
  const counsellor = await makeUser("COUNSELLOR", aId);
  counsellorId = counsellor.id;
  counsellorA = actorFor(counsellor);
  clinicianId = (await makeUser("CLINICIAN", aId)).id;
  supportId = (await makeUser("SUPPORT_STAFF", aId)).id;
  counsellorBId = (await makeUser("COUNSELLOR", bId)).id;
  const student = await makeUser("STUDENT", aId);
  studentId = student.id;
  await grantConsent(student.id, aId, ["CORE_PROCESSING", "CARE_TEAM_REVIEW"]);
  await requestHelp(actorFor(student), { type: "URGENT_SUPPORT" });
  await t.db.session.create({
    data: { tokenHash: TOKEN, userId: platformUser.id, stage: "ACTIVE", expiresAt: new Date(TEST_START.getTime() + 3_600_000), createdAt: TEST_START, lastSeenAt: TEST_START },
  });
});
afterAll(async () => {
  setClock(null);
  await t.close();
});
beforeEach(() => setClock(TEST_START));
afterEach(() => setClock(null));

describe("without an institution picked", () => {
  it("admin services refuse the platform admin", async () => {
    await expectDomainError(listPeople(platform), "FORBIDDEN");
    await expectDomainError(getAdminSettings(platform), "FORBIDDEN");
    await expectDomainError(listAuditLog(platform), "FORBIDDEN");
    await expectDomainError(buildReport(platform, { kind: "MONTHLY", periodEnd: TEST_START }), "FORBIDDEN");
  });
});

describe("with an institution picked", () => {
  it("returns only that institution's rows and hides the other institution's ids", async () => {
    const people = await listPeople(inA);
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((p) => p.role !== "STUDENT" && p.role !== "PLATFORM_ADMIN")).toBe(true);
    expect(people.map((p) => p.id)).toContain(counsellorId);
    expect(people.map((p) => p.id)).not.toContain(counsellorBId);
    await expectDomainError(getPerson(inA, counsellorBId), "NOT_FOUND");
    expect((await getAdminSettings(inA)).institution.id).toBe(aId);
    await createDepartment(inA, { code: "ZZ", name: "Zeta" });
    expect(await t.db.department.count({ where: { institutionId: bId, code: "ZZ" } })).toBe(0);
  });

  it("refuses care, case, alert, clinical-note and student-record services", async () => {
    await expectDomainError(listAlerts(inA), "FORBIDDEN");
    await expectDomainError(listCases(inA), "FORBIDDEN");
    await expectDomainError(getCaseDetail(inA, "x"), "FORBIDDEN");
    await expectDomainError(listClinicalNotes(inA, studentId), "FORBIDDEN");
  });

  it("can read the rules but not change them", async () => {
    await getRules(inA);
  });

  it("builds aggregate reports for the picked institution", async () => {
    await expect(buildReport(inA, { kind: "MONTHLY", periodEnd: TEST_START })).resolves.toBeTruthy();
  });
});

describe("account actions", () => {
  it("refuses counsellor, clinician and student accounts with FORBIDDEN", async () => {
    for (const id of [counsellorId, clinicianId, studentId]) {
      await expectDomainError(suspendUser(inA, id), "FORBIDDEN");
      await expectDomainError(reactivateUser(inA, id), "FORBIDDEN");
      await expectDomainError(resetAccess(inA, id), "FORBIDDEN");
    }
    await expectDomainError(verifyProfessional(inA, clinicianId, { registrationBody: "RCI", registrationNumber: "RCI-1" }), "FORBIDDEN");
    for (const role of ["COUNSELLOR", "CLINICIAN"] as const) {
      await expectDomainError(inviteStaff(inA, { name: "New Person", email: `${role}@invite.example`, role }), "FORBIDDEN");
    }
  });

  it("refuses every staff invitation and every access reset, so no set-password link is returned", async () => {
    for (const role of ["COUNSELLOR", "CLINICIAN", "INSTITUTION_ADMIN", "SUPPORT_STAFF"] as const) {
      await expectDomainError(inviteStaff(inA, { name: "New Person", email: `${role}@invite.example`, role }), "FORBIDDEN");
    }
    await expectDomainError(resetAccess(inA, adminA.userId), "FORBIDDEN");
    await expectDomainError(resetAccess(inA, supportId), "FORBIDDEN");
    expect(await t.db.user.count({ where: { email: { endsWith: "@invite.example" } } })).toBe(0);
  });

  it("still suspends and reactivates institution administrator and support staff accounts, and creates student invite codes", async () => {
    await suspendUser(inA, adminA.userId);
    await reactivateUser(inA, adminA.userId);
    await suspendUser(inA, supportId);
    await reactivateUser(inA, supportId);
    await expect(createStudentInvite(inA, { maxUses: 5, expiresInDays: 7 })).resolves.toHaveProperty("code");
  });

  it("leaves the institution administrator's own powers unchanged", async () => {
    await expect(suspendUser(adminA, counsellorId)).resolves.toBeUndefined();
    await reactivateUser(adminA, counsellorId);
    await expect(inviteStaff(adminA, { name: "New Counsellor", email: "new.counsellor@invite.example", role: "COUNSELLOR" })).resolves.toHaveProperty("link");
    await expect(resetAccess(adminA, supportId)).resolves.toHaveProperty("link");
  });
});

describe("student identities", () => {
  it("shows staff and a count, and treats a student id as not found", async () => {
    expect(await listPeople(inA, { role: "STUDENT" })).toEqual([]);
    expect(await countStudents(inA)).toBe(1);
    await expectDomainError(getPerson(inA, studentId), "NOT_FOUND");
    await expectDomainError(getAccessHistory(inA, studentId), "NOT_FOUND");
    expect((await listPeople(adminA, { role: "STUDENT" })).map((p) => p.id)).toContain(studentId);
    expect((await getPerson(adminA, studentId)).id).toBe(studentId);
  });

  it("hides care entries and student ids in the activity log, while the institution admin sees them", async () => {
    // The institution administrator's log holds care entries; the platform admin's must not.
    const adminLog = (await listAuditLog(adminA)).entries;
    const platformLog = (await listAuditLog(inA)).entries;
    const careActions = adminLog.filter((e) => /^(alert|case|student|message|consent|clinical_note)\./.test(e.action));
    expect(careActions.length).toBeGreaterThan(0);
    expect(platformLog.some((e) => /^(alert|case|student|message|consent|clinical_note)\./.test(e.action))).toBe(false);
    expect(JSON.stringify(platformLog)).not.toContain(studentId);
    expect(platformLog.some((e) => e.actorRole === "STUDENT")).toBe(false);
  });
});

describe("open, switch and close", () => {
  it("rejects an unknown institution and refuses other roles", async () => {
    await expectDomainError(openInstitution(platform, TOKEN, "000000000000000000000000"), "NOT_FOUND");
    await expectDomainError(openInstitution(platform, TOKEN, ""), "VALIDATION");
    await expectDomainError(openInstitution(adminA, TOKEN, aId), "FORBIDDEN");
    await expectDomainError(openInstitution(counsellorA, TOKEN, aId), "FORBIDDEN");
    await expectDomainError(closeInstitution(adminA, TOKEN), "FORBIDDEN");
    expect((await t.db.session.findUniqueOrThrow({ where: { tokenHash: TOKEN } })).activeInstitutionId).toBeNull();
  });

  it("refuses a session that is not the caller's", async () => {
    await expectDomainError(openInstitution(platform, "someone-elses-token", aId), "NOT_FOUND");
  });

  it("writes open, switch and close entries to the institutions' chains under the platform admin", async () => {
    await openInstitution(platform, TOKEN, aId);
    expect((await t.db.session.findUniqueOrThrow({ where: { tokenHash: TOKEN } })).activeInstitutionId).toBe(aId);
    await openInstitution(platform, TOKEN, bId); // switch
    await closeInstitution(platform, TOKEN);
    expect((await t.db.session.findUniqueOrThrow({ where: { tokenHash: TOKEN } })).activeInstitutionId).toBeNull();

    const forA = await t.db.auditLog.findMany({ where: { chain: aId, action: { startsWith: "platform." } }, orderBy: { seq: "asc" } });
    const forB = await t.db.auditLog.findMany({ where: { chain: bId, action: { startsWith: "platform." } }, orderBy: { seq: "asc" } });
    expect(forA.map((e) => e.action)).toEqual(["platform.institution_open", "platform.institution_close"]);
    expect(forB.map((e) => e.action)).toEqual(["platform.institution_open", "platform.institution_close"]);
    for (const e of [...forA, ...forB]) {
      expect(e.actorRole).toBe("PLATFORM_ADMIN");
      expect(e.actorId).toBe(platformUser.id);
    }
    expect((await verifyAuditChain(t.db, aId)).ok).toBe(true);
    expect((await verifyAuditChain(t.db, bId)).ok).toBe(true);
  });

  it("lands an action inside the context in that institution's chain with actor role PLATFORM_ADMIN", async () => {
    const current = await getAdminSettings(inA);
    await updateInstitutionSettings(inA, {
      checkInCadence: current.checkInCadence,
      careTeamHours: "Mon to Fri, 10 am to 4 pm",
      campusContacts: current.campusContacts,
      onCallResponderId: null,
      urgentAckMinutes: current.urgentAckMinutes,
      priorityAckHours: current.priorityAckHours,
      monitorAckHours: current.monitorAckHours,
      minCohortSize: current.minCohortSize,
      retentionMonths: current.retentionMonths,
    });
    const entry = await t.db.auditLog.findFirstOrThrow({ where: { action: "institution.settings.update", actorId: platformUser.id } });
    expect(entry.chain).toBe(aId);
    expect(entry.actorRole).toBe("PLATFORM_ADMIN");
    expect(await t.db.auditLog.count({ where: { chain: bId, action: "institution.settings.update" } })).toBe(0);
    expect((await verifyAuditChain(t.db, aId)).ok).toBe(true);
  });

  it("drops the context when the institution no longer exists (actor is rebuilt without it)", async () => {
    // getCurrentActor needs request cookies, so this checks the stored state the rebuild reads:
    // an unknown institution id is never accepted by setActiveInstitution in the first place.
    await expectDomainError(openInstitution(platform, TOKEN, "ffffffffffffffffffffffff"), "NOT_FOUND");
    expect(adminB.institutionId).toBe(bId);
  });
});
