import type { ConsultationMode, Profession } from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, now } from "@/lib/clock";
import { db } from "@/lib/db";

export type DirectorySlot = { id: string; startsAt: Date; endsAt: Date; mode: ConsultationMode };

export type DirectoryEntry = {
  userId: string;
  name: string;
  profession: Profession;
  qualifications: string;
  registrationBody: string | null;
  registrationNumber: string | null;
  verifiedAt: Date | null;
  specialisations: string[];
  languages: string[];
  feeInr: number;
  bio: string;
  offersVideo: boolean;
  slots: DirectorySlot[];
};

export const DIRECTORY_WINDOW_DAYS = 14;

/** Verified clinicians of the caller's institution with their open times in the next 14 days.
 * Professionals who are not verified, or whose account is not active, never appear. */
export async function listDirectory(actor: UserActor): Promise<DirectoryEntry[]> {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  const from = now();
  const to = new Date(from.getTime() + DIRECTORY_WINDOW_DAYS * DAY);

  const profiles = await db.professionalProfile.findMany({
    where: { institutionId, verification: "VERIFIED", user: { is: { status: "ACTIVE", role: "CLINICIAN", institutionId } } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  if (profiles.length === 0) return [];

  const slots = await db.availabilitySlot.findMany({
    where: {
      institutionId,
      status: "OPEN",
      professionalId: { in: profiles.map((p) => p.userId) },
      startsAt: { gt: from, lt: to },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, professionalId: true, startsAt: true, endsAt: true, mode: true },
  });
  const byProfessional = new Map<string, DirectorySlot[]>();
  for (const s of slots) {
    const list = byProfessional.get(s.professionalId) ?? [];
    list.push({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, mode: s.mode });
    byProfessional.set(s.professionalId, list);
  }

  return profiles.map((p) => ({
    userId: p.userId,
    name: p.user.name,
    profession: p.profession,
    qualifications: p.qualifications,
    registrationBody: p.registrationBody,
    registrationNumber: p.registrationNumber,
    verifiedAt: p.verifiedAt,
    specialisations: p.specialisations,
    languages: p.languages,
    feeInr: p.feeInr,
    bio: p.bio,
    offersVideo: p.offersVideo,
    slots: byProfessional.get(p.userId) ?? [],
  }));
}
