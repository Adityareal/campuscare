import type { Locale, Profession, Role } from "@prisma/client";
import { z } from "zod";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { db, runTx } from "@/lib/db";
import { DomainError, fail } from "@/lib/errors";
import { emailSchema, issueSetPasswordLink, personNameSchema } from "@/lib/services/admin";

export const MAX_ROSTER_ROWS = 200;

const ROLE_VALUES = ["STUDENT", "COUNSELLOR", "CLINICIAN"] as const;
const PROFESSION_VALUES = ["COUNSELLOR", "COUNSELLING_PSYCHOLOGIST", "CLINICAL_PSYCHOLOGIST", "PSYCHIATRIST"] as const;
const optionalCell = (max: number) =>
  z.string().trim().max(max, "A cell is too long.").transform((value) => value || null);

const RosterCellSchema = z.object({
  __rowNumber: z.number().int().min(2).max(10_000).optional(),
  name: z.string().max(160),
  email: z.string().max(220),
  role: z.string().max(40),
  departmentCode: optionalCell(12),
  studentNumber: optionalCell(40),
  academicYear: optionalCell(2),
  locale: optionalCell(8),
  contactPhone: optionalCell(20),
  profession: optionalCell(40),
  qualifications: optionalCell(300),
  registrationBody: optionalCell(120),
  registrationNumber: optionalCell(80),
  languages: optionalCell(1200),
  specialisations: optionalCell(1200),
  feeInr: optionalCell(6),
  bio: optionalCell(1000),
});

type NormalizedRow = {
  name: string;
  email: string;
  role: (typeof ROLE_VALUES)[number];
  departmentCode: string | null;
  studentNumber: string | null;
  academicYear: number | null;
  locale: Locale;
  contactPhone: string | null;
  professional: null | {
    profession: Profession;
    qualifications: string;
    registrationBody: string | null;
    registrationNumber: string | null;
    languages: string[];
    specialisations: string[];
    feeInr: number;
    bio: string;
  };
};

export type RosterImportSuccess = {
  row: number;
  name: string;
  email: string;
  role: (typeof ROLE_VALUES)[number];
  link: string;
  expiresAt: string;
};

export type RosterImportFailure = { row: number; message: string };

export type RosterImportResult = {
  created: RosterImportSuccess[];
  skipped: RosterImportFailure[];
  auditSummaryRecorded: boolean;
};

function rowIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check this row's values.";
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  const entries = value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  if (entries.length > 20 || entries.some((item) => item.length > 60)) {
    fail("VALIDATION", "Languages and areas of focus allow up to 20 entries, each 60 characters or fewer.");
  }
  return [...new Set(entries)];
}

function normalizeRow(value: unknown): NormalizedRow {
  const parsed = RosterCellSchema.safeParse(value);
  if (!parsed.success) fail("VALIDATION", rowIssue(parsed.error));
  const cells = parsed.data;
  const name = personNameSchema.safeParse(cells.name);
  if (!name.success) fail("VALIDATION", rowIssue(name.error));
  const email = emailSchema.safeParse(cells.email);
  if (!email.success) fail("VALIDATION", rowIssue(email.error));

  const role = cells.role.trim().toUpperCase();
  if (!(ROLE_VALUES as readonly string[]).includes(role)) {
    fail("VALIDATION", "Role must be STUDENT, COUNSELLOR, or CLINICIAN.");
  }

  const departmentCode = cells.departmentCode?.toUpperCase() ?? null;
  const studentNumber = cells.studentNumber;
  let academicYear: number | null = null;
  if (cells.academicYear) {
    if (!/^\d+$/.test(cells.academicYear)) fail("VALIDATION", "Academic year must be a whole number from 1 to 6.");
    academicYear = Number(cells.academicYear);
  }

  if (role === "STUDENT") {
    if (!departmentCode) fail("VALIDATION", "Students need a departmentCode that matches a department in this institution.");
    if (!studentNumber || studentNumber.length < 2 || studentNumber.length > 40) {
      fail("VALIDATION", "Students need a studentNumber between 2 and 40 characters.");
    }
    if (academicYear === null || academicYear < 1 || academicYear > 6) {
      fail("VALIDATION", "Students need an academicYear from 1 to 6.");
    }
  }

  let locale: Locale = "en";
  if (cells.locale) {
    const rawLocale = cells.locale.toLowerCase();
    if (rawLocale !== "en" && rawLocale !== "hi") fail("VALIDATION", "Locale must be en or hi.");
    locale = rawLocale;
  }

  let contactPhone: string | null = null;
  if (cells.contactPhone) {
    if (!/^[+0-9()\s-]{7,20}$/.test(cells.contactPhone)) fail("VALIDATION", "Contact phone must contain 7 to 20 valid phone characters.");
    contactPhone = cells.contactPhone;
  }
  if (cells.registrationBody && cells.registrationBody.length < 2) fail("VALIDATION", "Registration body must be at least 2 characters when provided.");
  if (cells.registrationNumber && cells.registrationNumber.length < 2) fail("VALIDATION", "Registration number must be at least 2 characters when provided.");

  const profileFields = [
    cells.profession,
    cells.qualifications,
    cells.registrationBody,
    cells.registrationNumber,
    cells.languages,
    cells.specialisations,
    cells.feeInr,
    cells.bio,
  ];
  let professional: NormalizedRow["professional"] = null;
  if (role !== "STUDENT" && profileFields.some(Boolean)) {
    if (!cells.qualifications || cells.qualifications.length < 2) {
      fail("VALIDATION", "Add qualifications to create a professional profile, or leave all professional fields blank.");
    }
    const profession = (cells.profession || (role === "CLINICIAN" ? "CLINICAL_PSYCHOLOGIST" : "COUNSELLOR")).toUpperCase();
    if (!(PROFESSION_VALUES as readonly string[]).includes(profession)) {
      fail("VALIDATION", "Profession must be COUNSELLOR, COUNSELLING_PSYCHOLOGIST, CLINICAL_PSYCHOLOGIST, or PSYCHIATRIST.");
    }
    let feeInr = 0;
    if (cells.feeInr) {
      if (!/^\d+$/.test(cells.feeInr)) fail("VALIDATION", "Fee must be a whole number of rupees.");
      feeInr = Number(cells.feeInr);
      if (feeInr > 100_000) fail("VALIDATION", "Fee cannot be more than 100000 rupees.");
    }
    professional = {
      profession: profession as Profession,
      qualifications: cells.qualifications,
      registrationBody: cells.registrationBody,
      registrationNumber: cells.registrationNumber,
      languages: parseList(cells.languages),
      specialisations: parseList(cells.specialisations),
      feeInr,
      bio: cells.bio ?? "",
    };
  }

  return {
    name: name.data,
    email: email.data,
    role: role as NormalizedRow["role"],
    departmentCode,
    studentNumber,
    academicYear,
    locale,
    contactPhone,
    professional,
  };
}

function rowNumberError(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002") {
    return "This email address or student number is already in use.";
  }
  return "This row could not be processed. Check the People list before retrying it.";
}

/** Provisions roster entries one at a time so invalid rows do not block valid accounts.
 * New accounts have no password; each receives the existing hashed, one-time setup link. */
export async function importInstitutionRoster(actor: UserActor, input: unknown): Promise<RosterImportResult> {
  assertCan(actor, "user.manage");
  const institutionId = tenantOf(actor);
  if (!Array.isArray(input)) fail("VALIDATION", "The roster data could not be read. Choose the file and try again.");
  if (input.length < 1) fail("VALIDATION", "The spreadsheet has no data rows.");
  if (input.length > MAX_ROSTER_ROWS) fail("VALIDATION", `Import up to ${MAX_ROSTER_ROWS} rows at a time.`);

  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { emailDomain: true } });
  if (!institution) fail("NOT_FOUND", "Institution not found.");
  const departments = await db.department.findMany({ where: { institutionId }, select: { id: true, code: true } });
  const departmentByCode = new Map(departments.map((department) => [department.code.toUpperCase(), department.id]));
  const created: RosterImportSuccess[] = [];
  const skipped: RosterImportFailure[] = [];
  const seenEmails = new Set<string>();
  const seenStudentNumbers = new Set<string>();

  for (let index = 0; index < input.length; index += 1) {
    const sourceRow = input[index] && typeof input[index] === "object" ? (input[index] as { __rowNumber?: unknown }).__rowNumber : null;
    const rowNumber = typeof sourceRow === "number" && Number.isInteger(sourceRow) && sourceRow >= 2 && sourceRow <= 10_000 ? sourceRow : index + 2;
    let row: NormalizedRow;
    try {
      row = normalizeRow(input[index]);
    } catch (error) {
      skipped.push({ row: rowNumber, message: rowNumberError(error) });
      continue;
    }

    if (seenEmails.has(row.email)) {
      skipped.push({ row: rowNumber, message: "This email address is repeated in the spreadsheet." });
      continue;
    }
    const studentKey = row.role === "STUDENT" ? row.studentNumber?.toLowerCase() ?? null : null;
    if (studentKey && seenStudentNumbers.has(studentKey)) {
      skipped.push({ row: rowNumber, message: "This student number is repeated in the spreadsheet." });
      continue;
    }

    try {
      if (row.role === "STUDENT" && row.email.slice(row.email.lastIndexOf("@") + 1) !== institution.emailDomain.toLowerCase()) {
        fail("VALIDATION", `Student email must use the institution domain @${institution.emailDomain}.`);
      }
      const departmentId = row.role === "STUDENT" ? departmentByCode.get(row.departmentCode ?? "") : null;
      if (row.role === "STUDENT" && !departmentId) fail("VALIDATION", `Department code ${row.departmentCode} does not exist in this institution.`);

      const oneTime = await runTx(async (tx) => {
        const existingEmail = await tx.user.findUnique({ where: { email: row.email }, select: { id: true } });
        if (existingEmail) fail("VALIDATION", "An account with this email address already exists.");
        if (row.role === "STUDENT") {
          const existingNumber = await tx.studentProfile.findUnique({
            where: { institutionId_studentNumber: { institutionId, studentNumber: row.studentNumber! } },
            select: { id: true },
          });
          if (existingNumber) fail("VALIDATION", "This student number is already registered in this institution.");
        }

        const at = now();
        const user = await tx.user.create({
          data: {
            institutionId,
            email: row.email,
            name: row.name,
            role: row.role as Role,
            locale: row.locale,
            passwordHash: null,
            createdAt: at,
            ...(row.role === "STUDENT"
              ? {
                  student: {
                    create: {
                      institutionId,
                      departmentId: departmentId!,
                      studentNumber: row.studentNumber!,
                      academicYear: row.academicYear!,
                      contactPhone: row.contactPhone,
                      createdAt: at,
                    },
                  },
                }
              : row.professional
                ? {
                    professional: {
                      create: {
                        institutionId,
                        profession: row.professional.profession,
                        qualifications: row.professional.qualifications,
                        registrationBody: row.professional.registrationBody,
                        registrationNumber: row.professional.registrationNumber,
                        languages: row.professional.languages,
                        specialisations: row.professional.specialisations,
                        feeInr: row.professional.feeInr,
                        bio: row.professional.bio,
                      },
                    },
                  }
                : {}),
          },
          select: { id: true },
        });
        const setup = await issueSetPasswordLink(tx, user.id, at);
        await recordAudit(tx, actor, {
          action: "user.invite",
          entityType: "User",
          entityId: user.id,
          metadata: { role: row.role, professionalProfile: !!row.professional, source: "roster_import", row: rowNumber },
        });
        return setup;
      });

      seenEmails.add(row.email);
      if (studentKey) seenStudentNumbers.add(studentKey);
      created.push({
        row: rowNumber,
        name: row.name,
        email: row.email,
        role: row.role,
        link: oneTime.link,
        expiresAt: oneTime.expiresAt.toISOString(),
      });
    } catch (error) {
      skipped.push({ row: rowNumber, message: rowNumberError(error) });
    }
  }

  let auditSummaryRecorded = true;
  try {
    await runTx(async (tx) => {
      await recordAudit(tx, actor, {
        action: "user.roster_import",
        entityType: "Institution",
        entityId: institutionId,
        metadata: {
          rows: input.length,
          created: created.length,
          skipped: skipped.length,
          students: created.filter((item) => item.role === "STUDENT").length,
          counsellors: created.filter((item) => item.role === "COUNSELLOR").length,
          clinicians: created.filter((item) => item.role === "CLINICIAN").length,
        },
      });
    });
  } catch {
    auditSummaryRecorded = false;
  }

  return { created, skipped, auditSummaryRecorded };
}
