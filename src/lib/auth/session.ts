import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { now } from "@/lib/clock";
import { randomToken, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { isDemoDeployment } from "@/lib/demo";

export const SESSION_COOKIE = "cc_session";
const STAFF_SESSION_HOURS = 8;
const STUDENT_SESSION_HOURS = 24 * 7;
const MFA_PENDING_MINUTES = 10;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** MFA_PENDING sessions passed the password check only. They authorise nothing except the
 * second-factor step, and are replaced (new token) once the second factor succeeds. */
export type SessionStage = "ACTIVE" | "MFA_PENDING";

export function homeFor(role: Role): string {
  switch (role) {
    case "STUDENT":
      return "/student";
    case "COUNSELLOR":
      return "/counsellor";
    case "CLINICIAN":
      return "/clinician";
    case "INSTITUTION_ADMIN":
      return "/admin";
    case "PLATFORM_ADMIN":
      return "/platform";
    case "SUPPORT_STAFF":
      return "/account";
  }
}

export function demoModeEnabled(): boolean {
  return isDemoDeployment();
}

async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  });
}

/** Secure-only cookies in production, except for an explicit plain-http loopback origin
 * (a local review of the production build), where browsers may refuse to store them. */
function secureCookies(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(process.env.APP_ORIGIN ?? "");
}

/** Only callable from Server Actions and Route Handlers (it sets a cookie). */
export async function createSession(
  userId: string,
  role: Role,
  opts: { userAgent?: string | null; stage?: SessionStage } = {},
): Promise<void> {
  const stage = opts.stage ?? "ACTIVE";
  const token = randomToken();
  const t = now();
  // Signing in again replaces the browser's previous session instead of leaving it alive.
  const previous = (await cookies()).get(SESSION_COOKIE)?.value;
  if (previous) await db.session.deleteMany({ where: { tokenHash: sha256(previous) } });
  const lifetimeMs =
    stage === "MFA_PENDING"
      ? MFA_PENDING_MINUTES * 60_000
      : (role === "STUDENT" ? STUDENT_SESSION_HOURS : STAFF_SESSION_HOURS) * 3_600_000;
  const expiresAt = new Date(t.getTime() + lifetimeMs);
  await db.session.create({
    data: { tokenHash: sha256(token), userId, stage, expiresAt, createdAt: t, lastSeenAt: t, userAgent: opts.userAgent?.slice(0, 200) ?? null },
  });
  await setSessionCookie(token, expiresAt);
}

async function currentSessionRow() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: { id: true, role: true, institutionId: true, name: true, locale: true, status: true, isDemo: true, mfaEnabledAt: true },
      },
    },
  });
  if (!session || session.expiresAt <= now() || session.user.status !== "ACTIVE") return null;
  return session;
}

/** The user behind a session that has passed the password check but not the second factor. */
export async function getPendingMfaUser() {
  const s = await currentSessionRow();
  return s && s.stage === "MFA_PENDING" ? s.user : null;
}

/** After a successful second factor: deletes the pending session and issues a fresh full one,
 * so a pre-authentication token can never be upgraded in place. Server Actions only. */
export async function promotePendingSession(userAgent?: string | null): Promise<Role | null> {
  const s = await currentSessionRow();
  if (!s || s.stage !== "MFA_PENDING") return null;
  await db.session.delete({ where: { id: s.id } });
  await createSession(s.user.id, s.user.role, { userAgent });
  return s.user.role;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Resolves the signed-in user once per request. Pending (password-only) sessions are not users. */
export const getCurrentActor = cache(async (): Promise<UserActor | null> => {
  const session = await currentSessionRow();
  if (!session || session.stage !== "ACTIVE") return null;
  if (now().getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now() } });
  }
  const u = session.user;
  const mfa: NonNullable<UserActor["mfa"]> =
    u.role === "STUDENT" ? "not_required" : u.mfaEnabledAt ? "enrolled" : u.isDemo && demoModeEnabled() ? "demo_exempt" : "missing";
  const base: UserActor = { kind: "user", userId: u.id, role: u.role, institutionId: u.institutionId, name: u.name, locale: u.locale, mfa, isDemo: u.isDemo };
  // Only a platform administrator reads the picked institution, and only if it still exists.
  if (u.role !== "PLATFORM_ADMIN" || !session.activeInstitutionId) return base;
  const picked = await db.institution.findUnique({ where: { id: session.activeInstitutionId }, select: { id: true } });
  if (!picked) {
    await db.session.update({ where: { id: session.id }, data: { activeInstitutionId: null } });
    return base;
  }
  return { ...base, institutionId: picked.id, actingInInstitution: true };
});

/** The hash of the signed-in browser's session token, for the open and close actions. */
export async function currentSessionTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

/** For pages, layouts and server actions: a signed-in actor with one of the given roles, or a
 * redirect. Staff without a second factor are sent to enrol one first. */
export async function requireActor(roles?: readonly Role[], opts: { allowMissingMfa?: boolean } = {}): Promise<UserActor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/sign-in");
  if (actor.mfa === "missing" && !opts.allowMissingMfa) redirect("/account/security");
  if (roles && !roles.includes(actor.role)) redirect(homeFor(actor.role));
  return actor;
}
