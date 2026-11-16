import { redirect } from "next/navigation";
import type { UserActor } from "@/lib/actor";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getConsentState } from "@/lib/services/consent";

/** Students must review the current privacy policy before using anything except /help-now
 * and the onboarding page itself. */
export async function requireStudent(opts: { allowConsentReview?: boolean } = {}): Promise<UserActor> {
  const actor = await requireActor(["STUDENT"]);
  if (!opts.allowConsentReview) {
    const consent = await getConsentState(db, actor.userId);
    if (consent.needsReview) redirect("/student/onboarding");
  }
  return actor;
}

/** Case management and alert review: counsellors and clinicians. */
export function requireCareTeam(): Promise<UserActor> {
  return requireActor(["COUNSELLOR", "CLINICIAN"]);
}

export function requireClinician(): Promise<UserActor> {
  return requireActor(["CLINICIAN"]);
}

export function requireInstitutionAdmin(): Promise<UserActor> {
  return requireActor(["INSTITUTION_ADMIN"]);
}

export function requirePlatformAdmin(): Promise<UserActor> {
  return requireActor(["PLATFORM_ADMIN"]);
}
