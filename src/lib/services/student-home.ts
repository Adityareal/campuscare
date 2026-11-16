import type { UserActor } from "@/lib/actor";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, now } from "@/lib/clock";
import { db } from "@/lib/db";
import { getInstitutionSettings } from "@/lib/services/config";
import { getConsentState } from "@/lib/services/consent";

/** How far back the home page trend chart reaches. */
const TREND_WEEKS = 8;

/**
 * Everything the student home page shows, read in one place and scoped to the signed-in
 * student and their institution. Check-in notes are never loaded here.
 */
export async function getStudentHome(actor: UserActor) {
  assertCan(actor, "own.history.read");
  const institutionId = tenantOf(actor);
  const at = now();
  const since = new Date(at.getTime() - TREND_WEEKS * 7 * DAY);

  const [consent, settings, latestCheckIn, trendRows, assigned, appointments, unreadMessages, notifications] = await Promise.all([
    getConsentState(db, actor.userId),
    getInstitutionSettings(db, institutionId),
    db.checkIn.findFirst({
      where: { studentId: actor.userId, institutionId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, mood: true, stress: true, sleep: true },
    }),
    db.checkIn.findMany({
      where: { studentId: actor.userId, institutionId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 120,
      select: { createdAt: true, mood: true, stress: true, sleep: true },
    }),
    db.assessment.findMany({
      where: { studentId: actor.userId, institutionId, status: "ASSIGNED" },
      orderBy: { assignedAt: "desc" },
      take: 10,
      select: { id: true, instrument: true, source: true, dueAt: true, assignedAt: true },
    }),
    db.appointment.findMany({
      where: { studentId: actor.userId, institutionId, status: "BOOKED", startsAt: { gte: at } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, startsAt: true, endsAt: true, mode: true, professional: { select: { name: true } } },
    }),
    db.message.count({
      where: { institutionId, readAt: null, senderId: { not: actor.userId }, case: { studentId: actor.userId, institutionId } },
    }),
    db.notification.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, template: true, link: true, createdAt: true, readAt: true },
    }),
  ]);

  return {
    consent,
    settings: {
      institutionName: settings.institutionName,
      careTeamHours: settings.careTeamHours,
      campusContacts: settings.campusContacts,
      checkInCadence: settings.checkInCadence,
      minCohortSize: settings.minCohortSize,
    },
    latestCheckIn,
    trend: trendRows,
    assessments: assigned,
    appointments,
    unreadMessages,
    notifications,
  };
}

export type StudentHome = Awaited<ReturnType<typeof getStudentHome>>;
