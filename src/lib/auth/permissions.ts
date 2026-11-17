import type { Role } from "@prisma/client";
import type { Actor, UserActor } from "@/lib/actor";
import { fail } from "@/lib/errors";

/**
 * Role capabilities (PRD section 11). Role checks are only the first gate: services also
 * enforce institution scope, student consent and record-level rules.
 * Platform administrators deliberately hold no clinical or student-record permission.
 */
const MATRIX = {
  "checkin.create": ["STUDENT"],
  "own.history.read": ["STUDENT"],
  "help.request": ["STUDENT"],
  "appointment.book": ["STUDENT"],
  "consent.manage.own": ["STUDENT"],
  "alert.review": ["COUNSELLOR", "CLINICIAN"],
  "case.manage": ["COUNSELLOR", "CLINICIAN"],
  "student.record.read": ["COUNSELLOR", "CLINICIAN"],
  "referral.create": ["COUNSELLOR", "CLINICIAN"],
  "assessment.request": ["COUNSELLOR", "CLINICIAN"],
  "message.send": ["STUDENT", "COUNSELLOR", "CLINICIAN"],
  "availability.manage": ["CLINICIAN"],
  "consultation.conduct": ["CLINICIAN"],
  "clinical_note.read": ["CLINICIAN"],
  "clinical_note.write": ["CLINICIAN"],
  "rules.read": ["COUNSELLOR", "CLINICIAN", "INSTITUTION_ADMIN"],
  // Clinical thresholds belong to clinical governance, not to institutional administration.
  "rules.configure": ["CLINICIAN"],
  "analytics.aggregate.read": ["INSTITUTION_ADMIN"],
  "report.generate": ["INSTITUTION_ADMIN"],
  "institution.manage": ["INSTITUTION_ADMIN"],
  "user.manage": ["INSTITUTION_ADMIN"],
  "audit.read": ["INSTITUTION_ADMIN"],
  "tenant.manage": ["PLATFORM_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function roleCan(role: Role, permission: Permission): boolean {
  return (MATRIX[permission] as readonly Role[]).includes(role);
}

export function can(actor: Actor | null | undefined, permission: Permission): actor is UserActor {
  return !!actor && actor.kind === "user" && roleCan(actor.role, permission);
}

export function assertCan(actor: Actor, permission: Permission): asserts actor is UserActor {
  if (!can(actor, permission)) fail("FORBIDDEN", "You do not have permission for this action.");
}

/** Institution-scoped actors only. Returns the institution id for query scoping. */
export function tenantOf(actor: Actor): string {
  if (!actor.institutionId) fail("FORBIDDEN", "This action requires an institution context.");
  return actor.institutionId;
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => roleCan(role, p));
}

export const STAFF_CARE_ROLES: readonly Role[] = ["COUNSELLOR", "CLINICIAN"];
