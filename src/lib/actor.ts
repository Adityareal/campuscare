import type { Locale, Role } from "@prisma/client";

/** A signed-in person acting through the UI. */
export type UserActor = {
  kind: "user";
  userId: string;
  role: Role;
  institutionId: string | null;
  /** Set only while a platform administrator is working inside an institution workspace. */
  actingInstitutionId?: string | null;
  name: string;
  locale: Locale;
  /** Second-factor state. Staff without an enrolled factor are sent to enrol before anything else. */
  mfa?: "not_required" | "enrolled" | "demo_exempt" | "missing";
  isDemo?: boolean;
};

/** Automated processes. They can create alerts and reminders but can never close, resolve or
 * downgrade anything: every service that ends a piece of care work requires a UserActor. */
export type SystemActor = {
  kind: "system";
  /** "auth" records sign-in attempts that cannot be tied to an account. */
  name: "risk-engine" | "scheduler" | "seed" | "auth";
  institutionId: string | null;
};

export type Actor = UserActor | SystemActor;

export function systemActor(name: SystemActor["name"], institutionId: string | null): SystemActor {
  return { kind: "system", name, institutionId };
}

export function actorId(a: Actor): string | null {
  return a.kind === "user" ? a.userId : null;
}

export function actorRole(a: Actor): string {
  return a.kind === "user" ? a.role : `SYSTEM:${a.name}`;
}
