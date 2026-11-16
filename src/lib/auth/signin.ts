import { cookies } from "next/headers";
import type { User } from "@/generated/prisma/client";
import type { Locale, Role } from "@/generated/prisma/enums";
import { systemActor, type Actor, type SystemActor, type UserActor } from "@/lib/actor";
import { now, MINUTE } from "@/lib/clock";
import { decryptField, encryptField, sha256 } from "@/lib/crypto";
import { recordAudit, type AuditInput } from "@/lib/audit";
import { createSession, demoModeEnabled, getPendingMfaUser, promotePendingSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { demoPersona } from "@/lib/demo";
import { DomainError, fail } from "@/lib/errors";

/*
 * Sign-in, second factor, registration and account security.
 *
 * Audit entries here never contain an email address or a password. Failures carry a reason
 * code only, and attempts against an unknown account go to the "platform" chain with no entity.
 */

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const GENERIC_SIGN_IN_FAILURE = "The email or password is not correct.";

/** Actor recorded for attempts that cannot be tied to a person (unknown account). */
const ANONYMOUS: SystemActor = systemActor("auth", null);

type UserRow = User;

function actorFor(user: Pick<UserRow, "id" | "role" | "institutionId" | "name" | "locale" | "isDemo">): UserActor {
  return { kind: "user", userId: user.id, role: user.role, institutionId: user.institutionId, name: user.name, locale: user.locale, isDemo: user.isDemo };
}

async function audit(actor: Actor, input: AuditInput): Promise<void> {
  await db.$transaction((tx) => recordAudit(tx, actor, input));
}

// A password check against a throwaway hash for unknown accounts, so response time does not
// reveal whether an email is registered.
let dummyHash: Promise<string> | null = null;
function burnVerification(password: string): Promise<boolean> {
  dummyHash ??= hashPassword("campuscare-timing-equaliser");
  return dummyHash.then((h) => verifyPassword(password, h)).then(() => false);
}

function minutesLeft(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now().getTime()) / MINUTE));
}

function lockedMessage(until: Date): string {
  const m = minutesLeft(until);
  return `Too many unsuccessful attempts. Please wait ${m} ${m === 1 ? "minute" : "minutes"} and try again.`;
}

/** Counts a failed attempt and locks the account after the limit. Returns the lock time, if any. */
async function recordFailedAttempt(user: UserRow, action: string, reason: string): Promise<Date | null> {
  return db.$transaction(async (tx) => {
    const t = now();
    const updated = await tx.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
    let lockedUntil: Date | null = null;
    if (updated.failedLogins >= MAX_FAILED_LOGINS) {
      lockedUntil = new Date(t.getTime() + LOCK_MINUTES * MINUTE);
      // The counter restarts so the person gets a fresh set of attempts once the lock ends.
      await tx.user.update({ where: { id: user.id }, data: { lockedUntil, failedLogins: 0 } });
    }
    await recordAudit(tx, actorFor(user), {
      action,
      entityType: "User",
      entityId: user.id,
      metadata: { reason, locked: lockedUntil !== null },
    });
    return lockedUntil;
  });
}

// ---------- Password sign-in ----------

export type SignInResult = { next: "home" | "verify"; role: Role };

/** Server Actions only (it sets the session cookie). */
export async function signInWithPassword(email: string, password: string, userAgent?: string | null): Promise<SignInResult> {
  const normalised = email.trim().toLowerCase();
  const user = normalised ? await db.user.findUnique({ where: { email: normalised } }) : null;

  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    await burnVerification(password);
    const reason = !user ? "unknown_account" : user.status !== "ACTIVE" ? "suspended" : "no_password";
    await audit(user ? actorFor(user) : ANONYMOUS, {
      action: "auth.sign_in_failed",
      entityType: "User",
      entityId: user?.id ?? null,
      institutionId: user ? user.institutionId : "platform",
      metadata: { reason },
    });
    fail("UNAUTHENTICATED", GENERIC_SIGN_IN_FAILURE);
  }

  const t = now();
  if (user.lockedUntil && user.lockedUntil > t) {
    await audit(actorFor(user), { action: "auth.sign_in_failed", entityType: "User", entityId: user.id, metadata: { reason: "locked" } });
    fail("LOCKED", lockedMessage(user.lockedUntil));
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const lockedUntil = await recordFailedAttempt(user, "auth.sign_in_failed", "wrong_password");
    if (lockedUntil) fail("LOCKED", lockedMessage(lockedUntil));
    fail("UNAUTHENTICATED", GENERIC_SIGN_IN_FAILURE);
  }

  const needsSecondFactor = user.role !== "STUDENT" && user.mfaEnabledAt !== null;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: t } });
    await recordAudit(tx, actorFor(user), {
      action: "auth.sign_in",
      entityType: "User",
      entityId: user.id,
      metadata: { method: "password", stage: needsSecondFactor ? "password_verified" : "complete" },
    });
  });
  await createSession(user.id, user.role, { userAgent, stage: needsSecondFactor ? "MFA_PENDING" : "ACTIVE" });
  return { next: needsSecondFactor ? "verify" : "home", role: user.role };
}

/** Completes a sign-in that is waiting for its second factor. Server Actions only. */
export async function verifySecondFactor(code: string, userAgent?: string | null): Promise<{ role: Role }> {
  const pending = await getPendingMfaUser();
  if (!pending) fail("UNAUTHENTICATED", "Your sign-in has expired. Please sign in again.");
  const user = await db.user.findUnique({ where: { id: pending.id } });
  if (!user || user.status !== "ACTIVE" || !user.mfaSecretCt || !user.mfaEnabledAt) {
    fail("UNAUTHENTICATED", "Your sign-in has expired. Please sign in again.");
  }

  const t = now();
  if (user.lockedUntil && user.lockedUntil > t) fail("LOCKED", lockedMessage(user.lockedUntil));

  const counter = verifyTotp(decryptField(user.mfaSecretCt), code, t, user.mfaLastCounter);
  if (counter === null) {
    const lockedUntil = await recordFailedAttempt(user, "auth.sign_in_failed", "wrong_second_factor");
    if (lockedUntil) fail("LOCKED", lockedMessage(lockedUntil));
    fail("VALIDATION", "That code did not work. Check the code in your authenticator app and try again.");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mfaLastCounter: counter, failedLogins: 0, lockedUntil: null } });
    await recordAudit(tx, actorFor(user), {
      action: "auth.sign_in",
      entityType: "User",
      entityId: user.id,
      metadata: { method: "password_and_totp", stage: "complete" },
    });
  });
  const role = await promotePendingSession(userAgent);
  if (!role) fail("UNAUTHENTICATED", "Your sign-in has expired. Please sign in again.");
  return { role };
}

// ---------- Demo personas ----------

/** One-click sign-in for the seeded demo people. Refused unless DEMO_MODE is on and the user is a
 * demo user. Server Actions only. */
export async function signInAsDemoPersona(key: string, userAgent?: string | null): Promise<{ role: Role }> {
  if (!demoModeEnabled()) fail("FORBIDDEN", "Demo sign-in is not available.");
  const persona = demoPersona(key);
  if (!persona) fail("FORBIDDEN", "Demo sign-in is not available.");
  const user = await db.user.findUnique({ where: { email: persona.email } });
  if (!user || user.status !== "ACTIVE" || !user.isDemo) fail("FORBIDDEN", "Demo sign-in is not available.");

  const t = now();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: t } });
    await recordAudit(tx, actorFor(user), {
      action: "auth.sign_in",
      entityType: "User",
      entityId: user.id,
      metadata: { method: "demo_persona", stage: "complete" },
    });
  });
  await createSession(user.id, user.role, { userAgent });
  return { role: user.role };
}

// ---------- Student registration ----------

export type RegisterStudentInput = {
  inviteCode: string;
  name: string;
  email: string;
  studentNumber: string;
  departmentId: string;
  academicYear: number;
  locale: string;
  phone?: string | null;
  password: string;
  userAgent?: string | null;
};

const INVALID_INVITE = "This invitation code is not valid or has expired. Ask your student services office for a new one.";

/** Read-only check used by the registration page before it shows the form. */
export async function findUsableInvite(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const invite = await db.inviteCode.findUnique({
    where: { code: trimmed },
    include: { institution: { include: { departments: { orderBy: { name: "asc" } } } } },
  });
  if (!invite || invite.role !== "STUDENT" || invite.expiresAt <= now() || invite.uses >= invite.maxUses) return null;
  return invite;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Creates a student account from an invitation code and signs the student in. Email ownership is
 * not verified in this version: anyone who can type an address on the institution's domain and
 * holds a valid code can register with it. Server Actions only.
 */
export async function registerStudent(input: RegisterStudentInput): Promise<{ userId: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const studentNumber = input.studentNumber.trim();
  const phone = input.phone?.trim() || null;

  if (name.length < 2 || name.length > 120) fail("VALIDATION", "Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("VALIDATION", "Enter a valid email address.");
  if (studentNumber.length < 2 || studentNumber.length > 40) fail("VALIDATION", "Enter your student number.");
  if (!Number.isInteger(input.academicYear) || input.academicYear < 1 || input.academicYear > 6) {
    fail("VALIDATION", "Choose your academic year, from 1 to 6.");
  }
  if (input.locale !== "en" && input.locale !== "hi") fail("VALIDATION", "Choose English or Hindi.");
  const locale: Locale = input.locale;
  if (phone !== null && !/^[+0-9()\s-]{7,20}$/.test(phone)) fail("VALIDATION", "Enter a valid phone number, or leave it blank.");
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    fail("VALIDATION", `Choose a password with at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  const invite = await findUsableInvite(input.inviteCode);
  if (!invite) fail("VALIDATION", INVALID_INVITE);
  const institution = invite.institution;

  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain !== institution.emailDomain.toLowerCase()) {
    fail("VALIDATION", `Use your institutional email address, ending in @${institution.emailDomain}.`);
  }
  if (!institution.departments.some((d) => d.id === input.departmentId)) fail("VALIDATION", "Choose your department from the list.");

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await db.$transaction(async (tx) => {
      const t = now();
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        fail("VALIDATION", "An account with this email already exists. Try signing in instead.");
      }
      const sameNumber = await tx.studentProfile.findUnique({
        where: { institutionId_studentNumber: { institutionId: institution.id, studentNumber } },
        select: { id: true },
      });
      if (sameNumber) fail("VALIDATION", "This student number is already registered. If it is yours, ask your student services office for help.");

      // Compare-and-swap: two people using the last place of a code cannot both succeed.
      const claimed = await tx.inviteCode.updateMany({
        where: { id: invite.id, uses: { lt: invite.maxUses }, expiresAt: { gt: t } },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count !== 1) fail("VALIDATION", INVALID_INVITE);

      const created = await tx.user.create({
        data: {
          institutionId: institution.id,
          email,
          name,
          role: "STUDENT",
          passwordHash,
          locale,
          lastLoginAt: t,
          createdAt: t,
          student: {
            create: {
              institutionId: institution.id,
              departmentId: input.departmentId,
              studentNumber,
              academicYear: input.academicYear,
              contactPhone: phone,
              createdAt: t,
            },
          },
        },
        select: { id: true, role: true, institutionId: true, name: true, locale: true, isDemo: true },
      });
      await recordAudit(tx, actorFor(created), {
        action: "auth.register",
        entityType: "User",
        entityId: created.id,
        metadata: { inviteId: invite.id, departmentId: input.departmentId, locale },
      });
      return created;
    });
    await createSession(user.id, "STUDENT", { userAgent: input.userAgent });
    return { userId: user.id };
  } catch (error) {
    if (!(error instanceof DomainError) && isUniqueViolation(error)) {
      fail("VALIDATION", "That email or student number is already registered. Try signing in instead.");
    }
    throw error;
  }
}

// ---------- Set password link ----------

/** True while a set-password link can still be used. Read-only, for the page. */
export async function setPasswordTokenIsUsable(token: string): Promise<boolean> {
  if (!token) return false;
  const row = await db.accessToken.findUnique({ where: { tokenHash: sha256(token) }, select: { purpose: true, usedAt: true, expiresAt: true } });
  return !!row && row.purpose === "SET_PASSWORD" && row.usedAt === null && row.expiresAt > now();
}

export async function consumeSetPasswordToken(token: string, password: string): Promise<{ userId: string }> {
  if (password.length < PASSWORD_MIN_LENGTH) fail("VALIDATION", `Choose a password with at least ${PASSWORD_MIN_LENGTH} characters.`);
  const unusable = "This link has expired or was already used. Ask your administrator for a new one.";
  if (!token) fail("VALIDATION", unusable);
  const passwordHash = await hashPassword(password);

  return db.$transaction(async (tx) => {
    const t = now();
    const row = await tx.accessToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.purpose !== "SET_PASSWORD" || row.usedAt !== null || row.expiresAt <= t) fail("VALIDATION", unusable);

    const claimed = await tx.accessToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: t } });
    if (claimed.count !== 1) fail("VALIDATION", unusable);

    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
    // A new password ends every session opened with the old one.
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await recordAudit(tx, actorFor(row.user), { action: "auth.password_set", entityType: "User", entityId: row.userId, metadata: { via: "set_password_link" } });
    return { userId: row.userId };
  });
}

// ---------- Second factor enrolment ----------

export type MfaEnrollment = { secret: string; uri: string };

/** Staff only. Creates a fresh secret that stays inactive until a code from it is confirmed. */
export async function startMfaEnrollment(actor: UserActor): Promise<MfaEnrollment> {
  if (actor.role === "STUDENT") fail("FORBIDDEN", "Students do not use a second step.");
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { id: true, email: true, mfaEnabledAt: true } });
  if (!user) fail("NOT_FOUND", "Account not found.");
  if (user.mfaEnabledAt) fail("INVALID_TRANSITION", "The second step is already on for this account.");

  const secret = generateTotpSecret();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mfaSecretCt: encryptField(secret), mfaEnabledAt: null, mfaLastCounter: null } });
    await recordAudit(tx, actor, { action: "auth.mfa_enrolment_started", entityType: "User", entityId: user.id });
  });
  return { secret, uri: otpauthUri(user.email, secret) };
}

/** The secret of an enrolment that was started but not confirmed, so a page reload shows the same one. */
export async function getPendingMfaEnrollment(actor: UserActor): Promise<MfaEnrollment | null> {
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { email: true, mfaSecretCt: true, mfaEnabledAt: true } });
  if (!user || user.mfaEnabledAt || !user.mfaSecretCt) return null;
  const secret = decryptField(user.mfaSecretCt);
  return { secret, uri: otpauthUri(user.email, secret) };
}

export async function getMfaStatus(actor: UserActor): Promise<{ enabledAt: Date | null }> {
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { mfaEnabledAt: true } });
  return { enabledAt: user?.mfaEnabledAt ?? null };
}

export async function confirmMfaEnrollment(actor: UserActor, code: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { id: true, mfaSecretCt: true, mfaEnabledAt: true } });
  if (!user) fail("NOT_FOUND", "Account not found.");
  if (user.mfaEnabledAt) fail("INVALID_TRANSITION", "The second step is already on for this account.");
  if (!user.mfaSecretCt) fail("INVALID_TRANSITION", "Start the setup first, then enter a code.");

  const counter = verifyTotp(decryptField(user.mfaSecretCt), code, now(), null);
  if (counter === null) fail("VALIDATION", "That code did not match. Check the code in your authenticator app and try again.");

  await db.$transaction(async (tx) => {
    const t = now();
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabledAt: t, mfaLastCounter: counter } });
    await recordAudit(tx, actor, { action: "auth.mfa_enrolled", entityType: "User", entityId: user.id });
  });
}

// ---------- Password and sessions ----------

async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export async function changePassword(actor: UserActor, current: string, next: string): Promise<void> {
  if (next.length < PASSWORD_MIN_LENGTH) fail("VALIDATION", `Choose a password with at least ${PASSWORD_MIN_LENGTH} characters.`);
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { id: true, passwordHash: true } });
  if (!user?.passwordHash) fail("NOT_FOUND", "Account not found.");
  if (!(await verifyPassword(current, user.passwordHash))) fail("VALIDATION", "Your current password is not correct.");
  if (next === current) fail("VALIDATION", "Choose a password that is different from the current one.");

  const passwordHash = await hashPassword(next);
  const keep = await currentTokenHash();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Other devices must sign in again with the new password; this one stays signed in.
    await tx.session.deleteMany({ where: { userId: user.id, ...(keep ? { tokenHash: { not: keep } } : {}) } });
    await recordAudit(tx, actor, { action: "auth.password_changed", entityType: "User", entityId: user.id });
  });
}

export type OwnSession = { id: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date; userAgent: string | null; current: boolean };

export async function listOwnSessions(actor: UserActor): Promise<OwnSession[]> {
  const keep = await currentTokenHash();
  const rows = await db.session.findMany({
    where: { userId: actor.userId, stage: "ACTIVE", expiresAt: { gt: now() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, tokenHash: true, createdAt: true, lastSeenAt: true, expiresAt: true, userAgent: true },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    expiresAt: r.expiresAt,
    userAgent: r.userAgent,
    current: r.tokenHash === keep,
  }));
}

/** Ends one of the actor's own sessions. Another person's session id behaves like a missing one. */
export async function revokeSession(actor: UserActor, sessionId: string): Promise<{ wasCurrent: boolean }> {
  const keep = await currentTokenHash();
  return db.$transaction(async (tx) => {
    const row = await tx.session.findFirst({ where: { id: sessionId, userId: actor.userId }, select: { id: true, tokenHash: true } });
    if (!row) fail("NOT_FOUND", "That session was not found. It may already have ended.");
    await tx.session.delete({ where: { id: row.id } });
    await recordAudit(tx, actor, { action: "auth.session_revoked", entityType: "Session", entityId: row.id });
    return { wasCurrent: row.tokenHash === keep };
  });
}

export type OwnProfile = { email: string; name: string; role: Role; institutionName: string | null; lastLoginAt: Date | null; mfaEnabledAt: Date | null };

/** The signed-in person's own account details, for the account page. */
export async function getOwnProfile(actor: UserActor): Promise<OwnProfile> {
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { email: true, name: true, role: true, lastLoginAt: true, mfaEnabledAt: true, institution: { select: { name: true } } },
  });
  if (!user) fail("NOT_FOUND", "Account not found.");
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    institutionName: user.institution?.name ?? null,
    lastLoginAt: user.lastLoginAt,
    mfaEnabledAt: user.mfaEnabledAt,
  };
}
