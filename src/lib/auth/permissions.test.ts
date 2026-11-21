import "@/test/env";
import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { systemActor, type UserActor } from "@/lib/actor";
import { assertCan, can, permissionsFor, roleCan, tenantOf, type Permission } from "@/lib/auth/permissions";
import { expectDomainErrorSync } from "@/test/expect";

const ROLES: Role[] = ["STUDENT", "COUNSELLOR", "CLINICIAN", "INSTITUTION_ADMIN", "SUPPORT_STAFF", "PLATFORM_ADMIN"];

const CLINICAL_OR_STUDENT: Permission[] = [
  "checkin.create",
  "own.history.read",
  "help.request",
  "appointment.book",
  "consent.manage.own",
  "alert.review",
  "case.manage",
  "student.record.read",
  "referral.create",
  "assessment.request",
  "message.send",
  "availability.manage",
  "consultation.conduct",
  "clinical_note.read",
  "clinical_note.write",
];

function user(role: Role, institutionId: string | null = "inst-1"): UserActor {
  return { kind: "user", userId: `u-${role}`, role, institutionId, name: role, locale: "en" };
}

describe("platform administrators", () => {
  it("hold no clinical or student-record permission", () => {
    for (const p of CLINICAL_OR_STUDENT) expect(roleCan("PLATFORM_ADMIN", p), p).toBe(false);
  });

  it("can only manage tenants", () => {
    expect(permissionsFor("PLATFORM_ADMIN")).toEqual(["tenant.manage"]);
  });
});

describe("institution administrators", () => {
  it("cannot read student records, clinical notes, alerts or cases", () => {
    for (const p of ["student.record.read", "clinical_note.read", "clinical_note.write", "alert.review", "case.manage", "message.send"] as Permission[]) {
      expect(roleCan("INSTITUTION_ADMIN", p), p).toBe(false);
    }
  });

  it("can read aggregates, manage the institution and read the rules", () => {
    for (const p of ["analytics.aggregate.read", "report.generate", "institution.manage", "user.manage", "audit.read", "rules.read"] as Permission[]) {
      expect(roleCan("INSTITUTION_ADMIN", p), p).toBe(true);
    }
  });
});

describe("clinical permissions", () => {
  it("only clinicians configure triage rules", () => {
    expect(ROLES.filter((r) => roleCan(r, "rules.configure"))).toEqual(["CLINICIAN"]);
  });

  it("only clinicians read or write clinical notes", () => {
    expect(ROLES.filter((r) => roleCan(r, "clinical_note.read"))).toEqual(["CLINICIAN"]);
    expect(ROLES.filter((r) => roleCan(r, "clinical_note.write"))).toEqual(["CLINICIAN"]);
  });

  it("support staff hold no clinical or student-record permission", () => {
    for (const p of CLINICAL_OR_STUDENT) expect(roleCan("SUPPORT_STAFF", p), p).toBe(false);
  });
});

describe("system actors", () => {
  it("never pass a permission check", () => {
    const engine = systemActor("risk-engine", "inst-1");
    for (const p of permissionsFor("COUNSELLOR")) {
      expect(can(engine, p)).toBe(false);
      expectDomainErrorSync(() => assertCan(engine, p), "FORBIDDEN");
    }
    expect(can(null, "alert.review")).toBe(false);
  });
});

describe("assertCan and tenantOf", () => {
  it("assertCan refuses roles outside the matrix and allows those inside", () => {
    expectDomainErrorSync(() => assertCan(user("STUDENT"), "alert.review"), "FORBIDDEN");
    expect(() => assertCan(user("COUNSELLOR"), "alert.review")).not.toThrow();
  });

  it("tenantOf requires an institution", () => {
    expect(tenantOf(user("COUNSELLOR"))).toBe("inst-1");
    expectDomainErrorSync(() => tenantOf(user("PLATFORM_ADMIN", null)), "FORBIDDEN");
  });
});

describe("platform administrators inside an institution", () => {
  const ALLOWED: Permission[] = ["analytics.aggregate.read", "report.generate", "institution.manage", "user.manage", "audit.read", "rules.read"];
  const ALL = Object.keys({
    ...Object.fromEntries(ROLES.flatMap((r) => permissionsFor(r).map((p) => [p, true]))),
  }) as Permission[];

  it("hold only tenant.manage without an institution picked", () => {
    const actor = user("PLATFORM_ADMIN", null);
    expect(ALL.filter((p) => can(actor, p))).toEqual(["tenant.manage"]);
  });

  it("hold tenant.manage plus exactly the six administration permissions once one is picked", () => {
    const actor: UserActor = { ...user("PLATFORM_ADMIN"), actingInInstitution: true };
    expect(ALL.filter((p) => can(actor, p)).sort()).toEqual(["tenant.manage", ...ALLOWED].sort());
    for (const p of ALL.filter((x) => x !== "tenant.manage" && !ALLOWED.includes(x))) expect(can(actor, p), p).toBe(false);
  });

  it("do not gain permissions from the flag without an institution id, and other roles ignore it", () => {
    expect(can({ ...user("PLATFORM_ADMIN", null), actingInInstitution: true }, "user.manage")).toBe(false);
    for (const role of ["STUDENT", "COUNSELLOR", "CLINICIAN", "SUPPORT_STAFF"] as Role[]) {
      const a: UserActor = { ...user(role), actingInInstitution: true };
      expect(ALL.filter((p) => can(a, p)).sort()).toEqual(permissionsFor(role).sort());
    }
  });

  it("leave the role matrix unchanged", () => {
    expect(permissionsFor("PLATFORM_ADMIN")).toEqual(["tenant.manage"]);
  });
});
