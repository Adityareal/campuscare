import { z } from "zod";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { db, runTx } from "@/lib/db";
import { fail } from "@/lib/errors";
import { DEFAULT_RULES } from "@/lib/risk/rules";
import { emailSchema, issueSetPasswordLink, parseInput, personNameSchema, type OneTimeLink } from "@/lib/services/admin";

/*
 * Platform tenant management. Platform administrators create and list institutions, and can
 * open one (openInstitution / closeInstitution) to use its administration pages with the
 * limited permission list in PLATFORM_IN_INSTITUTION (permissions.ts). They hold no
 * student-record, care or clinical permission and cannot manage counsellor, clinician or
 * student accounts. Opening, switching and closing are written to the institution's audit chain.
 */

export const DEFAULT_CARE_TEAM_HOURS = "Monday to Saturday, 9 am to 6 pm";

/**
 * Sets (or with null clears) the institution a platform administrator has picked on the
 * browser's current session. The only writer of Session.activeInstitutionId. The session
 * update and the audit entries share one transaction.
 */
export async function setActiveInstitution(actor: UserActor, tokenHash: string | null, institutionId: string | null): Promise<void> {
  assertCan(actor, "tenant.manage");
  if (!tokenHash) fail("NOT_FOUND", "Session not found.");
  await runTx(async (tx) => {
    const session = await tx.session.findFirst({ where: { tokenHash, userId: actor.userId, stage: "ACTIVE" } });
    if (!session) fail("NOT_FOUND", "Session not found.");
    if (institutionId) {
      const target = await tx.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
      if (!target) fail("NOT_FOUND", "Institution not found.");
    }
    const previous = session.activeInstitutionId ?? null;
    if (previous === institutionId) return;
    await tx.session.update({ where: { id: session.id }, data: { activeInstitutionId: institutionId } });
    if (previous) {
      await recordAudit(tx, actor, {
        action: "platform.institution_close",
        entityType: "Institution",
        entityId: previous,
        metadata: institutionId ? { switchedTo: institutionId } : {},
        institutionId: previous,
      });
    }
    if (institutionId) {
      await recordAudit(tx, actor, {
        action: "platform.institution_open",
        entityType: "Institution",
        entityId: institutionId,
        metadata: previous ? { switchedFrom: previous } : {},
        institutionId,
      });
    }
  });
}

export async function openInstitution(actor: UserActor, tokenHash: string | null, institutionId: string): Promise<void> {
  if (!institutionId) fail("VALIDATION", "Choose an institution.");
  return setActiveInstitution(actor, tokenHash, institutionId);
}

export const closeInstitution = (actor: UserActor, tokenHash: string | null) => setActiveInstitution(actor, tokenHash, null);

export type InstitutionRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  emailDomain: string;
  createdAt: Date;
  students: number;
  staff: number;
};

export async function listInstitutions(actor: UserActor): Promise<InstitutionRow[]> {
  assertCan(actor, "tenant.manage");
  const [institutions, counts] = await Promise.all([
    db.institution.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, city: true, emailDomain: true, createdAt: true },
    }),
    db.user.groupBy({ by: ["institutionId", "role"], _count: { _all: true } }),
  ]);
  const students = new Map<string, number>();
  const staff = new Map<string, number>();
  for (const c of counts) {
    if (!c.institutionId) continue;
    const target = c.role === "STUDENT" ? students : staff;
    target.set(c.institutionId, (target.get(c.institutionId) ?? 0) + c._count._all);
  }
  return institutions.map((i) => ({ ...i, students: students.get(i.id) ?? 0, staff: staff.get(i.id) ?? 0 }));
}

const CreateInstitutionSchema = z.object({
  name: z.string().trim().min(3, "Enter the institution name.").max(160, "Institution name is too long."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, digits and single hyphens for the short name.")
    .min(2, "The short name must be at least 2 characters.")
    .max(40, "The short name can be at most 40 characters."),
  city: z.string().trim().min(2, "Enter the city.").max(80, "City is too long."),
  emailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{3,120}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/, "Enter the email domain without @, for example university.ac.in."),
  adminName: personNameSchema,
  adminEmail: emailSchema,
});

export type CreateInstitutionInput = z.input<typeof CreateInstitutionSchema>;

/** Creates the tenant, its default configuration and its first administrator. The
 * administrator's set-password link is returned once and never stored in plain text. */
export async function createInstitution(
  actor: UserActor,
  input: CreateInstitutionInput,
): Promise<OneTimeLink & { institutionId: string }> {
  assertCan(actor, "tenant.manage");
  const data = parseInput(CreateInstitutionSchema, input);
  return runTx(async (tx) => {
    const [slugTaken, emailTaken] = await Promise.all([
      tx.institution.findUnique({ where: { slug: data.slug }, select: { id: true } }),
      tx.user.findUnique({ where: { email: data.adminEmail }, select: { id: true } }),
    ]);
    if (slugTaken) fail("VALIDATION", "Another institution already uses this short name.");
    if (emailTaken) fail("VALIDATION", "An account with this email address already exists.");

    const t = now();
    const institution = await tx.institution.create({
      data: { name: data.name, slug: data.slug, city: data.city, emailDomain: data.emailDomain, createdAt: t },
    });
    await tx.institutionConfiguration.create({
      data: {
        institutionId: institution.id,
        careTeamHours: DEFAULT_CARE_TEAM_HOURS,
        crisisContacts: [],
        riskRules: DEFAULT_RULES,
        riskRulesVersion: 1,
        updatedById: actor.userId,
        updatedAt: t,
      },
    });
    const admin = await tx.user.create({
      data: {
        institutionId: institution.id,
        name: data.adminName,
        email: data.adminEmail,
        role: "INSTITUTION_ADMIN",
        passwordHash: null,
        createdAt: t,
      },
    });
    const { link, expiresAt } = await issueSetPasswordLink(tx, admin.id, t);

    await recordAudit(tx, actor, {
      action: "tenant.create",
      entityType: "Institution",
      entityId: institution.id,
      metadata: { slug: data.slug, adminUserId: admin.id },
    });
    // The tenant's own chain starts with the creation of its first administrator.
    await recordAudit(tx, actor, {
      action: "user.invite",
      entityType: "User",
      entityId: admin.id,
      metadata: { role: "INSTITUTION_ADMIN", professionalProfile: false },
      institutionId: institution.id,
    });
    return { institutionId: institution.id, userId: admin.id, link, expiresAt };
  });
}
