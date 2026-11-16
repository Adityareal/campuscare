import type { Profession, ReferralService, ReferralStatus } from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { encryptField } from "@/lib/crypto";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { logCaseEvent, markMilestone } from "@/lib/services/cases";
import { notify } from "@/lib/services/notifications";

export const REFERRAL_SERVICES: readonly ReferralService[] = ["CAMPUS_COUNSELLING", "CLINICAL_PSYCHOLOGY", "PSYCHIATRY", "EXTERNAL_SERVICE"];

export const SERVICE_LABEL: Record<ReferralService, string> = {
  CAMPUS_COUNSELLING: "Campus counselling",
  CLINICAL_PSYCHOLOGY: "Clinical psychologist",
  PSYCHIATRY: "Psychiatrist",
  EXTERNAL_SERVICE: "External service",
};

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  CREATED: "Offered, not yet booked",
  BOOKED: "Booked",
  ATTENDED: "Attended",
  NOT_ATTENDED: "Not attended",
  DECLINED: "Declined",
  CLOSED: "Closed",
};

export const PROFESSION_LABEL: Record<Profession, string> = {
  COUNSELLOR: "Counsellor",
  COUNSELLING_PSYCHOLOGIST: "Counselling psychologist",
  CLINICAL_PSYCHOLOGIST: "Clinical psychologist",
  PSYCHIATRIST: "Psychiatrist",
};

const SERVICE_PROFESSIONS: Record<ReferralService, Profession[]> = {
  CAMPUS_COUNSELLING: ["COUNSELLOR", "COUNSELLING_PSYCHOLOGIST"],
  CLINICAL_PSYCHOLOGY: ["CLINICAL_PSYCHOLOGIST"],
  PSYCHIATRY: ["PSYCHIATRIST"],
  EXTERNAL_SERVICE: [],
};

/** Status changes a counsellor may make by hand. Booking and attendance come from the
 * student and the clinician, so they are not listed here. */
const COUNSELLOR_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  CREATED: ["DECLINED", "CLOSED"],
  BOOKED: [],
  ATTENDED: ["CLOSED"],
  NOT_ATTENDED: ["DECLINED", "CLOSED"],
  DECLINED: ["CREATED"],
  CLOSED: [],
};

export function counsellorReferralTransitions(status: ReferralStatus): ReferralStatus[] {
  return COUNSELLOR_TRANSITIONS[status];
}

export type ReferralInput = {
  caseId: string;
  service: ReferralService;
  professionalId?: string | null;
  reason: string;
};

/** Offers the student a next step. The reason is free text about the student, so it is stored encrypted. */
export async function createReferral(actor: UserActor, input: ReferralInput): Promise<string> {
  assertCan(actor, "referral.create");
  const institutionId = tenantOf(actor);
  if (!REFERRAL_SERVICES.includes(input.service)) fail("VALIDATION", "Choose a service for the referral.");
  const reason = input.reason.trim();
  if (reason.length < 3) fail("VALIDATION", "Write a short reason for the referral.");
  return db.$transaction(async (tx) => {
    const c = await tx.case.findFirst({ where: { id: input.caseId, institutionId } });
    if (!c) fail("NOT_FOUND", "Case not found.");
    if (c.status === "CLOSED") fail("INVALID_TRANSITION", "This case is closed. Reopen it before adding a referral.");
    let professionalId: string | null = null;
    if (input.professionalId) {
      const pro = await tx.user.findFirst({
        where: {
          id: input.professionalId,
          institutionId,
          role: "CLINICIAN",
          status: "ACTIVE",
          professional: { is: { verification: "VERIFIED" } },
        },
        select: { id: true },
      });
      if (!pro) fail("VALIDATION", "Choose a verified clinician from your institution.");
      professionalId = pro.id;
    }
    const t = now();
    const referral = await tx.referral.create({
      data: {
        institutionId,
        caseId: c.id,
        studentId: c.studentId,
        createdById: actor.userId,
        service: input.service,
        professionalId,
        reasonCt: encryptField(reason.slice(0, 2000)),
        status: "CREATED",
        createdAt: t,
        updatedAt: t,
      },
    });
    await markMilestone(tx, c.id, "REFERRED", actor.userId, `Referral offered: ${SERVICE_LABEL[input.service].toLowerCase()}`);
    await notify(tx, c.studentId, "referral_new", { institutionId, link: "/student/care" });
    await recordAudit(tx, actor, {
      action: "referral.create",
      entityType: "Referral",
      entityId: referral.id,
      metadata: { caseId: c.id, service: input.service, professionalId },
    });
    return referral.id;
  });
}

export async function updateReferralStatus(actor: UserActor, referralId: string, status: ReferralStatus, note?: string | null): Promise<void> {
  assertCan(actor, "referral.create");
  const institutionId = tenantOf(actor);
  await db.$transaction(async (tx) => {
    const r = await tx.referral.findFirst({ where: { id: referralId, institutionId } });
    if (!r) fail("NOT_FOUND", "Referral not found.");
    if (!COUNSELLOR_TRANSITIONS[r.status].includes(status)) {
      fail("INVALID_TRANSITION", `A referral that is "${REFERRAL_STATUS_LABEL[r.status].toLowerCase()}" cannot be changed to "${REFERRAL_STATUS_LABEL[status].toLowerCase()}" here.`);
    }
    const t = now();
    await tx.referral.update({ where: { id: r.id }, data: { status, updatedAt: t } });
    await logCaseEvent(tx, r.caseId, "REFERRAL_UPDATED", `Referral marked as ${REFERRAL_STATUS_LABEL[status].toLowerCase()}`, actor.userId, note?.trim() || null);
    await tx.case.update({ where: { id: r.caseId }, data: { updatedAt: t } });
    if (status === "CREATED") await notify(tx, r.studentId, "referral_new", { institutionId, link: "/student/care" });
    await recordAudit(tx, actor, {
      action: "referral.update",
      entityType: "Referral",
      entityId: r.id,
      metadata: { from: r.status, to: status },
    });
  });
}

/** Verified clinicians of the actor's institution, optionally narrowed to the professions
 * that deliver a service. */
export async function listReferralTargets(actor: UserActor, service?: ReferralService) {
  assertCan(actor, "referral.create");
  const institutionId = tenantOf(actor);
  if (service && !REFERRAL_SERVICES.includes(service)) fail("VALIDATION", "Choose a valid service.");
  if (service === "EXTERNAL_SERVICE") return [];
  const rows = await db.user.findMany({
    where: {
      institutionId,
      role: "CLINICIAN",
      status: "ACTIVE",
      professional: {
        is: { verification: "VERIFIED", ...(service ? { profession: { in: SERVICE_PROFESSIONS[service] } } : {}) },
      },
    },
    select: { id: true, name: true, professional: true },
    orderBy: { name: "asc" },
  });
  return rows.flatMap((u) =>
    u.professional
      ? [
          {
            userId: u.id,
            name: u.name,
            profession: u.professional.profession,
            qualifications: u.professional.qualifications,
            specialisations: u.professional.specialisations,
            languages: u.professional.languages,
            feeInr: u.professional.feeInr,
            bio: u.professional.bio,
            offersVideo: u.professional.offersVideo,
          },
        ]
      : [],
  );
}
