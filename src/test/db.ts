import "./env";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Department, Institution, Prisma, User } from "@prisma/client";
import type { ConsentDecision, ConsentScope, Locale, Profession, Role } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { now } from "@/lib/clock";
import { createDbClient, db as appDb, setDbForTesting, type Db } from "@/lib/db";
import { DEFAULT_RULES } from "@/lib/risk/rules";
import { CURRENT_POLICY_VERSION, ensureCurrentPolicy } from "@/lib/services/consent";

/** Fixed starting time for integration tests. Pass it to setClock in beforeEach. */
export const TEST_START = new Date("2026-11-10T05:00:00.000Z");

export type TestDb = { db: Db; url: string; close: () => Promise<void> };

/** The URL of the throwaway replica set that vitest's globalSetup started, with a database name. */
export function testDatabaseUrl(name: string): string {
  const base = process.env.TEST_MONGO_URI;
  if (!base) throw new Error("TEST_MONGO_URI is not set: the in-memory MongoDB is started by src/test/global-setup.ts.");
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * A fresh, empty database with its indexes created (`prisma db push`, so unique indexes behave as
 * in production), wired in as the application's database client so services under test use it.
 * Each test file gets its own database in the shared in-memory replica set; close() drops it.
 */
export async function createTestDb(): Promise<TestDb> {
  const url = testDatabaseUrl(`test_${randomBytes(6).toString("hex")}`);
  const prismaCli = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const db = createDbClient(url);
  setDbForTesting(db);
  return {
    db,
    url,
    close: async () => {
      await db.$runCommandRaw({ dropDatabase: 1 });
      await db.$disconnect();
    },
  };
}
// ---------- Fixtures ----------

let serial = 0;
const next = (): number => ++serial;

export async function makeInstitution(overrides: { name?: string; city?: string; onCallResponderId?: string | null } = {}): Promise<Institution> {
  const n = next();
  const institution = await appDb.institution.create({
    data: {
      name: overrides.name ?? `Test University ${n}`,
      slug: `test-university-${n}`,
      city: overrides.city ?? "Pune",
      emailDomain: `u${n}.example`,
      createdAt: now(),
    },
  });
  await appDb.institutionConfiguration.create({
    data: {
      institutionId: institution.id,
      careTeamHours: "Monday to Friday, 9 am to 5 pm",
      crisisContacts: [] as unknown as Prisma.InputJsonValue,
      riskRules: DEFAULT_RULES as unknown as Prisma.InputJsonValue,
      riskRulesVersion: DEFAULT_RULES.version,
      onCallResponderId: overrides.onCallResponderId ?? null,
    },
  });
  return institution;
}

export async function makeDepartment(institutionId: string, overrides: { code?: string; name?: string } = {}): Promise<Department> {
  const n = next();
  return appDb.department.create({
    data: { institutionId, code: overrides.code ?? `D${n}`, name: overrides.name ?? `Department ${n}` },
  });
}

export type UserOverrides = {
  name?: string;
  email?: string;
  locale?: Locale;
  isDemo?: boolean;
  departmentId?: string;
  academicYear?: number;
  profession?: Profession;
};

/** Creates a user. Students also get a StudentProfile (and a department when none is given);
 * clinicians get a VERIFIED ProfessionalProfile. */
export async function makeUser(role: Role, institutionId: string | null, overrides: UserOverrides = {}): Promise<User> {
  const n = next();
  const t = now();
  const user = await appDb.user.create({
    data: {
      institutionId,
      email: overrides.email ?? `${role.toLowerCase()}.${n}@test.example`,
      name: overrides.name ?? `Test ${role.toLowerCase()} ${n}`,
      role,
      locale: overrides.locale ?? "en",
      isDemo: overrides.isDemo ?? false,
      createdAt: t,
    },
  });
  if (role === "STUDENT") {
    if (!institutionId) throw new Error("A student needs an institution.");
    const departmentId = overrides.departmentId ?? (await makeDepartment(institutionId)).id;
    await appDb.studentProfile.create({
      data: {
        userId: user.id,
        institutionId,
        departmentId,
        studentNumber: `S${String(n).padStart(5, "0")}`,
        academicYear: overrides.academicYear ?? 2,
        createdAt: t,
      },
    });
  }
  if (role === "CLINICIAN") {
    if (!institutionId) throw new Error("A clinician needs an institution.");
    await appDb.professionalProfile.create({
      data: {
        userId: user.id,
        institutionId,
        profession: overrides.profession ?? "CLINICAL_PSYCHOLOGIST",
        qualifications: "M.Phil. Clinical Psychology",
        registrationBody: "RCI",
        registrationNumber: `RCI-${n}`,
        verification: "VERIFIED",
        verifiedAt: t,
        specialisations: [],
        languages: ["English"],
        bio: "Test clinician.",
      },
    });
  }
  return user;
}

/** Appends consent rows, as the privacy page would, for the given scopes. */
export async function grantConsent(
  userId: string,
  institutionId: string,
  scopes: ConsentScope[],
  decision: ConsentDecision = "GRANTED",
): Promise<void> {
  await ensureCurrentPolicy(appDb);
  const recordedAt = now();
  await appDb.consentRecord.createMany({
    data: scopes.map((scope) => ({
      userId,
      institutionId,
      policyVersion: CURRENT_POLICY_VERSION,
      scope,
      decision,
      locale: "en" as const,
      source: "test",
      recordedAt,
    })),
  });
}

export function actorFor(user: Pick<User, "id" | "role" | "institutionId" | "name" | "locale" | "isDemo">): UserActor {
  return {
    kind: "user",
    userId: user.id,
    role: user.role,
    institutionId: user.institutionId,
    name: user.name,
    locale: user.locale,
    mfa: user.role === "STUDENT" ? "not_required" : "enrolled",
    isDemo: user.isDemo,
  };
}
