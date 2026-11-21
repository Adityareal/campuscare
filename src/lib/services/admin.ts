import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Profession, Role, UserStatus, VerificationStatus } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { recordAudit, verifyAuditChain, type AuditMetadata, type ChainVerification } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, HOUR, now } from "@/lib/clock";
import { randomToken, sha256 } from "@/lib/crypto";
import { db, runTx, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import type { CrisisContact } from "@/lib/services/config";

/*
 * Institution administration: the staff and student directory, invitations, account access,
 * departments, institution settings and the audit log. Administrators manage accounts but
 * never see a student's check-ins, questionnaires, alerts, cases, messages or clinical notes,
 * so nothing here selects from those tables.
 */

// ---------- Shared helpers ----------

export const SET_PASSWORD_PURPOSE = "SET_PASSWORD";
export const SET_PASSWORD_TTL_MS = 72 * HOUR;

export function setPasswordLink(token: string): string {
  return `${process.env.APP_ORIGIN ?? "http://localhost:3000"}/set-password?token=${token}`;
}

/** Issues a one-time set-password token. Only its hash is stored; the link is returned once.
 * Earlier unused links for the same account stop working. */
export async function issueSetPasswordLink(client: DbLike, userId: string, at: Date): Promise<{ link: string; expiresAt: Date }> {
  await client.accessToken.deleteMany({ where: { userId, purpose: SET_PASSWORD_PURPOSE, usedAt: null } });
  const token = randomToken();
  const expiresAt = new Date(at.getTime() + SET_PASSWORD_TTL_MS);
  await client.accessToken.create({
    data: { userId, tokenHash: sha256(token), purpose: SET_PASSWORD_PURPOSE, expiresAt, createdAt: at },
  });
  return { link: setPasswordLink(token), expiresAt };
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, "Email address is too long.")
  .regex(EMAIL_RE, "Enter a valid email address.");
export const personNameSchema = z.string().trim().min(2, "Enter a name of at least 2 characters.").max(120, "Name is too long.");

/** A platform administrator inside an institution is an outside party. It never receives a
 * set-password link (inviteStaff, resetAccess refuse it for every role), because that link is a
 * real login: an institution administrator's account lists students and can invite counsellors.
 * It may suspend and reactivate institution administrator and support staff accounts only. */
const PLATFORM_MANAGED_ROLES: readonly Role[] = ["INSTITUTION_ADMIN", "SUPPORT_STAFF"];

const PLATFORM_NO_LINK_MESSAGE =
  "Platform administrators cannot create or reset sign-in links. Ask the institution's own administrator.";

function assertManageableRole(actor: UserActor, role: Role): void {
  if (actor.role === "PLATFORM_ADMIN" && !PLATFORM_MANAGED_ROLES.includes(role)) {
    fail("FORBIDDEN", "Platform administrators cannot manage counsellor, clinician or student accounts. Ask the institution's own administrator.");
  }
}

async function userInTenant(client: DbLike, actor: UserActor, institutionId: string, userId: string) {
  const user = await client.user.findFirst({ where: { id: userId, institutionId } });
  if (!user) fail("NOT_FOUND", "Person not found.");
  assertManageableRole(actor, user.role);
  return user;
}

async function assertEmailFree(client: DbLike, email: string): Promise<void> {
  const existing = await client.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) fail("VALIDATION", "An account with this email address already exists.");
}

// ---------- Directory ----------

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  mfaEnrolled: boolean;
  hasPassword: boolean;
  department: string | null;
  academicYear: number | null;
  professional: { profession: Profession; verification: VerificationStatus } | null;
};

const ROLES = ["STUDENT", "COUNSELLOR", "CLINICIAN", "INSTITUTION_ADMIN", "SUPPORT_STAFF"] as const;

const personSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  mfaEnabledAt: true,
  passwordHash: true,
  student: { select: { academicYear: true, department: { select: { name: true } } } },
  professional: { select: { profession: true, verification: true } },
} as const;

type PersonRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  mfaEnabledAt: Date | null;
  passwordHash: string | null;
  student: { academicYear: number; department: { name: string } } | null;
  professional: { profession: Profession; verification: VerificationStatus } | null;
};

function toPerson(u: PersonRecord): PersonRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    mfaEnrolled: !!u.mfaEnabledAt,
    hasPassword: !!u.passwordHash,
    department: u.student?.department.name ?? null,
    academicYear: u.student?.academicYear ?? null,
    professional: u.professional ? { profession: u.professional.profession, verification: u.professional.verification } : null,
  };
}

/** Directory fields only: name, email, role, department, year and account state. */
export async function listPeople(
  actor: UserActor,
  filter: { role?: Role | "STAFF"; query?: string | null } = {},
): Promise<PersonRow[]> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  const q = filter.query?.trim().slice(0, 100);
  // Platform administrators see staff only; students are reached through a count (countStudents).
  if (actor.role === "PLATFORM_ADMIN" && filter.role === "STUDENT") return [];
  const roleWhere =
    filter.role === "STAFF"
      ? { role: { in: ["COUNSELLOR", "CLINICIAN", "INSTITUTION_ADMIN", "SUPPORT_STAFF"] as Role[] } }
      : filter.role
        ? { role: filter.role }
        : { role: { notIn: (actor.role === "PLATFORM_ADMIN" ? ["PLATFORM_ADMIN", "STUDENT"] : ["PLATFORM_ADMIN"]) as Role[] } };
  const rows = await db.user.findMany({
    where: {
      institutionId,
      ...roleWhere,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] }
        : {}),
    },
    select: personSelect,
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: 500,
  });
  return rows.map(toPerson);
}

export async function getPerson(actor: UserActor, userId: string): Promise<PersonRow> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  const row = await db.user.findFirst({ where: { id: userId, institutionId }, select: personSelect });
  if (!row || (actor.role === "PLATFORM_ADMIN" && row.role === "STUDENT")) fail("NOT_FOUND", "Person not found.");
  return toPerson(row);
}

/** How many students the institution has. Platform administrators see this instead of names. */
export async function countStudents(actor: UserActor): Promise<number> {
  assertCan(actor, "user.manage");
  return db.user.count({ where: { institutionId: tenantOf(actor), role: "STUDENT" } });
}

// ---------- Staff invitations ----------

export const STAFF_ROLES = ["COUNSELLOR", "CLINICIAN", "INSTITUTION_ADMIN", "SUPPORT_STAFF"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const PROFESSIONS = ["COUNSELLOR", "COUNSELLING_PSYCHOLOGIST", "CLINICAL_PSYCHOLOGIST", "PSYCHIATRIST"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "One of the fields is too long.")
    .nullish()
    .transform((v) => (v ? v : null));

const stringList = z
  .array(z.string().trim().min(1).max(60, "Each list entry must be at most 60 characters."))
  .max(20, "Enter at most 20 entries in a list.");

const ProfessionalSchema = z.object({
  profession: z.enum(PROFESSIONS, "Choose a profession."),
  qualifications: z.string().trim().min(2, "Enter the qualifications.").max(300, "Qualifications are too long."),
  registrationBody: optionalText(120),
  registrationNumber: optionalText(80),
  languages: stringList,
  specialisations: stringList,
  feeInr: z.number().int("Fee must be a whole number of rupees.").min(0, "Fee cannot be negative.").max(100_000, "Fee is too high."),
  bio: z.string().trim().max(1000, "Bio must be at most 1000 characters."),
});

const InviteStaffSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  role: z.enum(STAFF_ROLES, "Choose a role."),
  professional: ProfessionalSchema.nullish(),
});

export type InviteStaffInput = z.input<typeof InviteStaffSchema>;
export type OneTimeLink = { userId: string; link: string; expiresAt: Date };

export async function inviteStaff(actor: UserActor, input: InviteStaffInput): Promise<OneTimeLink> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  const data = parseInput(InviteStaffSchema, input);
  if (actor.role === "PLATFORM_ADMIN") fail("FORBIDDEN", PLATFORM_NO_LINK_MESSAGE);
  if (data.professional && data.role !== "COUNSELLOR" && data.role !== "CLINICIAN") {
    fail("VALIDATION", "A professional profile can only be added for counsellors and clinicians.");
  }
  return runTx(async (tx) => {
    await assertEmailFree(tx, data.email);
    const t = now();
    const user = await tx.user.create({
      data: { institutionId, name: data.name, email: data.email, role: data.role, passwordHash: null, createdAt: t },
    });
    if (data.professional) {
      const p = data.professional;
      await tx.professionalProfile.create({
        data: {
          userId: user.id,
          institutionId,
          profession: p.profession,
          qualifications: p.qualifications,
          registrationBody: p.registrationBody,
          registrationNumber: p.registrationNumber,
          languages: p.languages,
          specialisations: p.specialisations,
          feeInr: p.feeInr,
          bio: p.bio,
        },
      });
    }
    const { link, expiresAt } = await issueSetPasswordLink(tx, user.id, t);
    await recordAudit(tx, actor, {
      action: "user.invite",
      entityType: "User",
      entityId: user.id,
      metadata: { role: data.role, professionalProfile: !!data.professional },
    });
    return { userId: user.id, link, expiresAt };
  });
}

// ---------- Student invite codes ----------

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Eight characters in two groups, without 0/O/1/I, so a code can be read aloud in a lecture. */
function readableCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += "-";
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

const StudentInviteSchema = z.object({
  maxUses: z.number().int("Uses must be a whole number.").min(1, "Allow at least 1 use.").max(5000, "Allow at most 5000 uses."),
  expiresInDays: z.number().int("Days must be a whole number.").min(1, "The code must last at least 1 day.").max(365, "The code can last at most 365 days."),
});

export type InviteRow = {
  id: string;
  code: string;
  role: Role;
  maxUses: number;
  uses: number;
  createdAt: Date;
  expiresAt: Date;
  state: "active" | "expired" | "used_up";
};

function inviteState(i: { expiresAt: Date; uses: number; maxUses: number }, at: Date): InviteRow["state"] {
  if (i.expiresAt.getTime() <= at.getTime()) return "expired";
  if (i.uses >= i.maxUses) return "used_up";
  return "active";
}

export async function createStudentInvite(actor: UserActor, input: { maxUses: number; expiresInDays: number }): Promise<InviteRow> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  const data = parseInput(StudentInviteSchema, input);
  return runTx(async (tx) => {
    let code = readableCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await tx.inviteCode.findUnique({ where: { code }, select: { id: true } });
      if (!clash) break;
      code = readableCode();
    }
    const t = now();
    const invite = await tx.inviteCode.create({
      data: { code, institutionId, role: "STUDENT", maxUses: data.maxUses, uses: 0, expiresAt: new Date(t.getTime() + data.expiresInDays * DAY), createdAt: t },
    });
    await recordAudit(tx, actor, {
      action: "invite.create",
      entityType: "InviteCode",
      entityId: invite.id,
      metadata: { maxUses: data.maxUses, expiresInDays: data.expiresInDays },
    });
    return { ...invite, state: inviteState(invite, t) };
  });
}

export async function listInvites(actor: UserActor): Promise<InviteRow[]> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  const t = now();
  const rows = await db.inviteCode.findMany({ where: { institutionId }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    role: r.role,
    maxUses: r.maxUses,
    uses: r.uses,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    state: inviteState(r, t),
  }));
}

export async function revokeInvite(actor: UserActor, inviteId: string): Promise<void> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  await runTx(async (tx) => {
    const invite = await tx.inviteCode.findFirst({ where: { id: inviteId, institutionId } });
    if (!invite) fail("NOT_FOUND", "Invite code not found.");
    const t = now();
    if (invite.expiresAt.getTime() <= t.getTime()) fail("INVALID_TRANSITION", "This invite code has already expired.");
    await tx.inviteCode.update({ where: { id: invite.id }, data: { expiresAt: t } });
    await recordAudit(tx, actor, { action: "invite.revoke", entityType: "InviteCode", entityId: invite.id });
  });
}

// ---------- Account access ----------

export async function suspendUser(actor: UserActor, userId: string): Promise<void> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  if (userId === actor.userId) fail("VALIDATION", "You cannot suspend your own account.");
  await runTx(async (tx) => {
    const user = await userInTenant(tx, actor, institutionId, userId);
    if (user.status === "SUSPENDED") fail("INVALID_TRANSITION", "This account is already suspended.");
    await tx.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    const { count } = await tx.session.deleteMany({ where: { userId: user.id } });
    await recordAudit(tx, actor, {
      action: "user.suspend",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role, sessionsEnded: count },
    });
  });
}

export async function reactivateUser(actor: UserActor, userId: string): Promise<void> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  await runTx(async (tx) => {
    const user = await userInTenant(tx, actor, institutionId, userId);
    if (user.status === "ACTIVE") fail("INVALID_TRANSITION", "This account is already active.");
    await tx.user.update({ where: { id: user.id }, data: { status: "ACTIVE", failedLogins: 0, lockedUntil: null } });
    await recordAudit(tx, actor, { action: "user.reactivate", entityType: "User", entityId: user.id, metadata: { role: user.role } });
  });
}

/** Signs the person out everywhere, removes their second factor and returns a new one-time
 * set-password link. Used when someone loses their phone or their password. */
export async function resetAccess(actor: UserActor, userId: string): Promise<OneTimeLink> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  if (userId === actor.userId) fail("VALIDATION", "Ask another administrator to reset your own access.");
  if (actor.role === "PLATFORM_ADMIN") fail("FORBIDDEN", PLATFORM_NO_LINK_MESSAGE);
  return runTx(async (tx) => {
    const user = await userInTenant(tx, actor, institutionId, userId);
    if (user.status !== "ACTIVE") fail("INVALID_TRANSITION", "Reactivate this account before resetting its access.");
    const t = now();
    const { count } = await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: { mfaSecretCt: null, mfaEnabledAt: null, mfaLastCounter: null, failedLogins: 0, lockedUntil: null },
    });
    const { link, expiresAt } = await issueSetPasswordLink(tx, user.id, t);
    await recordAudit(tx, actor, {
      action: "user.access_reset",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role, sessionsEnded: count },
    });
    return { userId: user.id, link, expiresAt };
  });
}

export type AccessHistory = {
  person: PersonRow;
  sessions: { id: string; stage: string; createdAt: Date; lastSeenAt: Date; expiresAt: Date; userAgent: string | null }[];
  events: { seq: number; createdAt: Date; action: string; actorRole: string | null; byThisPerson: boolean; metadata: AuditMetadata | null }[];
};

export async function getAccessHistory(actor: UserActor, userId: string): Promise<AccessHistory> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  const person = await getPerson(actor, userId);
  const [sessions, events] = await Promise.all([
    db.session.findMany({
      where: { userId: person.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, stage: true, createdAt: true, lastSeenAt: true, expiresAt: true, userAgent: true },
    }),
    db.auditLog.findMany({
      where: {
        chain: institutionId,
        action: { startsWith: "auth." },
        OR: [{ actorId: person.id }, { entityId: person.id }],
      },
      orderBy: { seq: "desc" },
      take: 100,
      select: { seq: true, createdAt: true, action: true, actorRole: true, actorId: true, metadata: true },
    }),
  ]);
  return {
    person,
    sessions,
    events: events.map((e) => ({
      seq: e.seq,
      createdAt: e.createdAt,
      action: e.action,
      actorRole: e.actorRole,
      byThisPerson: e.actorId === person.id,
      metadata: (e.metadata as AuditMetadata | null) ?? null,
    })),
  };
}

export type ProfessionalDetails = {
  profession: Profession;
  qualifications: string;
  registrationBody: string | null;
  registrationNumber: string | null;
  verification: VerificationStatus;
  verifiedAt: Date | null;
};

/** Registration details an administrator checks before verifying a professional. */
export async function getProfessionalProfile(actor: UserActor, userId: string): Promise<ProfessionalDetails | null> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  return db.professionalProfile.findFirst({
    where: { userId, institutionId },
    select: { profession: true, qualifications: true, registrationBody: true, registrationNumber: true, verification: true, verifiedAt: true },
  });
}

const VerifySchema = z.object({
  registrationBody: z.string().trim().min(2, "Enter the registration body.").max(120, "Registration body is too long."),
  registrationNumber: z.string().trim().min(2, "Enter the registration number.").max(80, "Registration number is too long."),
});

export async function verifyProfessional(
  actor: UserActor,
  userId: string,
  input: { registrationBody: string; registrationNumber: string },
): Promise<void> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  if (actor.role === "PLATFORM_ADMIN") {
    fail("FORBIDDEN", "Platform administrators cannot verify counsellors or clinicians. Ask the institution's own administrator.");
  }
  const data = parseInput(VerifySchema, input);
  await runTx(async (tx) => {
    const profile = await tx.professionalProfile.findFirst({ where: { userId, institutionId } });
    if (!profile) fail("NOT_FOUND", "Professional profile not found.");
    const t = now();
    await tx.professionalProfile.update({
      where: { id: profile.id },
      data: { verification: "VERIFIED", verifiedAt: t, registrationBody: data.registrationBody, registrationNumber: data.registrationNumber },
    });
    await recordAudit(tx, actor, {
      action: "professional.verify",
      entityType: "ProfessionalProfile",
      entityId: profile.id,
      metadata: { userId, previous: profile.verification },
    });
  });
}

// ---------- Departments ----------

const DepartmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,12}$/, "Use 2 to 12 letters or digits for the code, for example CSE."),
  name: z.string().trim().min(2, "Enter a department name.").max(120, "Department name is too long."),
});

export async function createDepartment(actor: UserActor, input: { code: string; name: string }): Promise<{ id: string }> {
  assertCan(actor, "institution.manage");
  const institutionId = tenantOf(actor);
  const data = parseInput(DepartmentSchema, input);
  return runTx(async (tx) => {
    const clash = await tx.department.findFirst({ where: { institutionId, code: data.code }, select: { id: true } });
    if (clash) fail("VALIDATION", "A department with this code already exists.");
    const dept = await tx.department.create({ data: { institutionId, code: data.code, name: data.name } });
    await recordAudit(tx, actor, { action: "department.create", entityType: "Department", entityId: dept.id, metadata: { code: data.code } });
    return { id: dept.id };
  });
}

export async function renameDepartment(actor: UserActor, departmentId: string, input: { name: string }): Promise<void> {
  assertCan(actor, "institution.manage");
  const institutionId = tenantOf(actor);
  const name = parseInput(DepartmentSchema.shape.name, input.name);
  await runTx(async (tx) => {
    const dept = await tx.department.findFirst({ where: { id: departmentId, institutionId } });
    if (!dept) fail("NOT_FOUND", "Department not found.");
    await tx.department.update({ where: { id: dept.id }, data: { name } });
    await recordAudit(tx, actor, { action: "department.rename", entityType: "Department", entityId: dept.id, metadata: { code: dept.code } });
  });
}

// ---------- Institution settings ----------

const ContactSchema = z.object({
  label: z.string().trim().min(2, "Each campus contact needs a label.").max(80, "A contact label is too long."),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+()\- ]{3,20}$/, "Enter each contact phone number using digits, spaces, +, brackets or hyphens."),
  hours: z.string().trim().min(2, "Enter the hours for each campus contact.").max(80, "Contact hours are too long."),
});

export const SettingsSchema = z.object({
  checkInCadence: z.enum(["DAILY", "WEEKLY"], "Choose a check-in cadence."),
  careTeamHours: z.string().trim().min(3, "Enter the care team hours.").max(160, "Care team hours are too long."),
  campusContacts: z.array(ContactSchema).max(10, "Add at most 10 campus contacts."),
  onCallResponderId: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null)),
  urgentAckMinutes: z.number("Enter the urgent window in minutes.").int().min(5, "The urgent window must be at least 5 minutes.").max(120, "The urgent window can be at most 120 minutes."),
  priorityAckHours: z.number("Enter the priority window in hours.").int().min(1, "The priority window must be at least 1 hour.").max(72, "The priority window can be at most 72 hours."),
  monitorAckHours: z.number("Enter the monitor window in hours.").int().min(12, "The monitor window must be at least 12 hours.").max(336, "The monitor window can be at most 336 hours."),
  minCohortSize: z.number("Enter the minimum group size.").int().min(5, "The minimum group size must be at least 5.").max(1000, "The minimum group size can be at most 1000."),
  retentionMonths: z.number("Enter the retention period in months.").int().min(6, "Keep records for at least 6 months.").max(120, "Records can be kept for at most 120 months."),
});

export type SettingsInput = z.input<typeof SettingsSchema>;

export type AdminSettings = {
  institution: { id: string; name: string; slug: string; city: string; emailDomain: string };
  checkInCadence: "DAILY" | "WEEKLY";
  careTeamHours: string;
  campusContacts: CrisisContact[];
  onCallResponderId: string | null;
  urgentAckMinutes: number;
  priorityAckHours: number;
  monitorAckHours: number;
  minCohortSize: number;
  retentionMonths: number;
  riskRulesVersion: number;
  updatedAt: Date;
  departments: { id: string; code: string; name: string; students: number }[];
  responders: { id: string; name: string; role: Role }[];
};

export async function getAdminSettings(actor: UserActor): Promise<AdminSettings> {
  assertCan(actor, "institution.manage");
  const institutionId = tenantOf(actor);
  const [config, departments, responders] = await Promise.all([
    db.institutionConfiguration.findUnique({
      where: { institutionId },
      include: { institution: { select: { id: true, name: true, slug: true, city: true, emailDomain: true } } },
    }),
    db.department.findMany({
      where: { institutionId },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, _count: { select: { students: true } } },
    }),
    db.user.findMany({
      where: { institutionId, role: { in: ["COUNSELLOR", "CLINICIAN"] }, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);
  if (!config) fail("NOT_FOUND", "Institution configuration is missing.");
  const contacts = Array.isArray(config.crisisContacts) ? (config.crisisContacts as CrisisContact[]) : [];
  return {
    institution: config.institution,
    checkInCadence: config.checkInCadence,
    careTeamHours: config.careTeamHours,
    campusContacts: contacts.filter((c) => c && typeof c.phone === "string"),
    onCallResponderId: config.onCallResponderId,
    urgentAckMinutes: config.urgentAckMinutes,
    priorityAckHours: config.priorityAckHours,
    monitorAckHours: config.monitorAckHours,
    minCohortSize: config.minCohortSize,
    retentionMonths: config.retentionMonths,
    riskRulesVersion: config.riskRulesVersion,
    updatedAt: config.updatedAt,
    departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name, students: d._count.students })),
    responders,
  };
}

export async function updateInstitutionSettings(actor: UserActor, input: SettingsInput): Promise<void> {
  assertCan(actor, "institution.manage");
  const institutionId = tenantOf(actor);
  const data = parseInput(SettingsSchema, input);
  await runTx(async (tx) => {
    const current = await tx.institutionConfiguration.findUnique({ where: { institutionId } });
    if (!current) fail("NOT_FOUND", "Institution configuration is missing.");
    if (data.onCallResponderId) {
      const responder = await tx.user.findFirst({
        where: { id: data.onCallResponderId, institutionId, role: { in: ["COUNSELLOR", "CLINICIAN"] }, status: "ACTIVE" },
        select: { id: true },
      });
      if (!responder) fail("VALIDATION", "The on-call responder must be an active counsellor or clinician of this institution.");
    }
    const changed: string[] = [];
    if (current.checkInCadence !== data.checkInCadence) changed.push("checkInCadence");
    if (current.careTeamHours !== data.careTeamHours) changed.push("careTeamHours");
    if (JSON.stringify(current.crisisContacts) !== JSON.stringify(data.campusContacts)) changed.push("campusContacts");
    if (current.onCallResponderId !== data.onCallResponderId) changed.push("onCallResponderId");
    if (current.urgentAckMinutes !== data.urgentAckMinutes) changed.push("urgentAckMinutes");
    if (current.priorityAckHours !== data.priorityAckHours) changed.push("priorityAckHours");
    if (current.monitorAckHours !== data.monitorAckHours) changed.push("monitorAckHours");
    if (current.minCohortSize !== data.minCohortSize) changed.push("minCohortSize");
    if (current.retentionMonths !== data.retentionMonths) changed.push("retentionMonths");
    if (!changed.length) return;
    const t = now();
    await tx.institutionConfiguration.update({
      where: { id: current.id },
      data: {
        checkInCadence: data.checkInCadence,
        careTeamHours: data.careTeamHours,
        crisisContacts: data.campusContacts,
        onCallResponderId: data.onCallResponderId,
        urgentAckMinutes: data.urgentAckMinutes,
        priorityAckHours: data.priorityAckHours,
        monitorAckHours: data.monitorAckHours,
        minCohortSize: data.minCohortSize,
        retentionMonths: data.retentionMonths,
        updatedById: actor.userId,
        updatedAt: t,
      },
    });
    await recordAudit(tx, actor, {
      action: "institution.settings.update",
      entityType: "InstitutionConfiguration",
      entityId: current.id,
      metadata: { fields: changed.join(","), minCohortSize: data.minCohortSize, campusContacts: data.campusContacts.length },
    });
  });
}

// ---------- Audit log ----------

export const AUDIT_PAGE_SIZE = 50;

export type AuditEntry = {
  seq: number;
  createdAt: Date;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: AuditMetadata | null;
};

export async function listAuditLog(
  actor: UserActor,
  opts: { before?: number | null; action?: string | null } = {},
): Promise<{ entries: AuditEntry[]; nextBefore: number | null }> {
  assertCan(actor, "audit.read");
  const institutionId = tenantOf(actor);
  const action = opts.action?.trim().slice(0, 80);
  const before = opts.before && Number.isInteger(opts.before) && opts.before > 0 ? opts.before : null;
  const platform = actor.role === "PLATFORM_ADMIN";
  const rows = await db.auditLog.findMany({
    where: {
      chain: institutionId,
      ...(before ? { seq: { lt: before } } : {}),
      ...(action ? { action: { startsWith: action } } : {}),
      // Platform administrators see administration entries only: no care or clinical activity and nothing a student did.
      ...(platform ? { actorRole: { not: "STUDENT" }, OR: PLATFORM_VISIBLE_AUDIT_PREFIXES.map((p) => ({ action: { startsWith: p } })) } : {}),
    },
    orderBy: { seq: "desc" },
    take: AUDIT_PAGE_SIZE + 1,
    select: { seq: true, createdAt: true, actorRole: true, action: true, entityType: true, entityId: true, metadata: true },
  });
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = page[page.length - 1];
  const entries = page.map((r) => ({ ...r, metadata: (r.metadata as AuditMetadata | null) ?? null }));
  return {
    entries: platform ? await withoutStudentIds(institutionId, entries) : entries,
    nextBefore: rows.length > AUDIT_PAGE_SIZE && last ? last.seq : null,
  };
}

/** Audit actions a platform administrator may read. Anything not listed here, including actions
 * added later, stays hidden from them. */
export const PLATFORM_VISIBLE_AUDIT_PREFIXES = ["auth.", "user.", "invite.", "institution.", "department.", "report.", "audit.", "tenant.", "platform.", "professional.", "rules."] as const;

/** Removes the ids of students from entries a platform administrator reads. */
async function withoutStudentIds(institutionId: string, entries: AuditEntry[]): Promise<AuditEntry[]> {
  const candidates = new Set<string>();
  for (const e of entries) {
    if (e.entityId) candidates.add(e.entityId);
    for (const v of Object.values(e.metadata ?? {})) if (typeof v === "string") candidates.add(v);
  }
  const found = candidates.size
    ? await db.user.findMany({ where: { institutionId, role: "STUDENT", id: { in: [...candidates] } }, select: { id: true } })
    : [];
  const students = new Set(found.map((s) => s.id));
  return entries.map((e) => ({
    ...e,
    entityId: e.entityId && students.has(e.entityId) ? null : e.entityId,
    metadata: e.metadata
      ? Object.fromEntries(Object.entries(e.metadata).filter(([k, v]) => k !== "studentId" && !(typeof v === "string" && students.has(v))))
      : null,
  }));
}

/** Recomputes the institution's hash chain. The check itself is recorded afterwards. */
export async function verifyInstitutionAuditChain(actor: UserActor): Promise<ChainVerification & { verifiedAt: Date }> {
  assertCan(actor, "audit.read");
  const institutionId = tenantOf(actor);
  const result = await verifyAuditChain(db, institutionId);
  const verifiedAt = now();
  await runTx(async (tx) => {
    await recordAudit(tx, actor, {
      action: "audit.verify",
      entityType: "AuditLog",
      entityId: null,
      metadata: { ok: result.ok, checked: result.checked, brokenAtSeq: result.brokenAtSeq },
    });
  });
  return { ...result, verifiedAt };
}

export { ROLES as DIRECTORY_ROLES };
