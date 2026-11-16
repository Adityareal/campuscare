import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, now } from "@/lib/clock";
import { db } from "@/lib/db";
import { isoDay, istToUtc } from "@/lib/format";
import { careTeamMaySeeTrends, studentInTenant } from "@/lib/services/access";
import { alertQueueSummary, listAlerts } from "@/lib/services/alerts";
import { OPEN_CASE_STATUSES } from "@/lib/services/cases";
import { getConsentState } from "@/lib/services/consent";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return value === undefined ? null : Math.round(value);
}

/** What a counsellor or clinician needs when they open the workspace. */
export async function getCareOverview(actor: UserActor) {
  assertCan(actor, "case.manage");
  assertCan(actor, "alert.review");
  const institutionId = tenantOf(actor);
  const t = now();
  const startOfToday = istToUtc(isoDay(t), "00:00");
  const endOfToday = new Date(startOfToday.getTime() + DAY);
  const since30 = new Date(t.getTime() - 30 * DAY);

  const [queue, openAlerts, myCases, dueFollowUps, recentCases, closedLast30Days, acknowledged] = await Promise.all([
    alertQueueSummary(actor),
    listAlerts(actor, { view: "open" }),
    db.case.findMany({
      where: {
        institutionId,
        status: { in: [...OPEN_CASE_STATUSES] },
        assignments: { some: { userId: actor.userId, endedAt: null } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { student: { select: { name: true } } },
    }),
    db.followUp.findMany({
      where: { institutionId, assignedToId: actor.userId, status: "SCHEDULED", dueAt: { lt: endOfToday } },
      orderBy: { dueAt: "asc" },
      take: 30,
      include: { case: { select: { id: true, reference: true } } },
    }),
    db.case.findMany({
      where: { institutionId, status: { in: [...OPEN_CASE_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { student: { select: { name: true } } },
    }),
    db.case.count({ where: { institutionId, status: "CLOSED", closedAt: { gte: since30 } } }),
    db.alert.findMany({
      where: { institutionId, createdAt: { gte: since30 }, acknowledgedAt: { not: null } },
      select: { createdAt: true, acknowledgedAt: true },
    }),
  ]);

  const studentIds = [...new Set(myCases.map((c) => c.studentId))];
  const appointments = studentIds.length
    ? await db.appointment.findMany({
        where: { institutionId, studentId: { in: studentIds }, status: "BOOKED", startsAt: { gte: t } },
        orderBy: { startsAt: "asc" },
        take: 10,
        include: { student: { select: { name: true } }, professional: { select: { name: true } } },
      })
    : [];
  const caseByStudent = new Map(myCases.map((c) => [c.studentId, c.id]));

  const followUpNames = await db.user.findMany({
    where: { id: { in: [...new Set(dueFollowUps.map((f) => f.studentId))] }, institutionId },
    select: { id: true, name: true },
  });
  const nameById = new Map(followUpNames.map((u) => [u.id, u.name]));
  const followUps = dueFollowUps.map((f) => ({
    id: f.id,
    caseId: f.caseId,
    caseReference: f.case?.reference ?? null,
    studentName: nameById.get(f.studentId) ?? "Unknown student",
    kind: f.kind,
    dueAt: f.dueAt,
    overdue: f.dueAt.getTime() < t.getTime(),
  }));

  const ackMinutes = acknowledged.flatMap((a) => (a.acknowledgedAt ? [Math.max(0, (a.acknowledgedAt.getTime() - a.createdAt.getTime()) / 60_000)] : []));

  return {
    alertQueueSummary: queue,
    topAlerts: openAlerts.slice(0, 8),
    myCases,
    followUpsOverdue: followUps.filter((f) => f.overdue),
    followUpsDueToday: followUps.filter((f) => !f.overdue),
    upcomingAppointments: appointments.map((a) => ({
      id: a.id,
      startsAt: a.startsAt,
      mode: a.mode,
      studentName: a.student.name,
      professionalName: a.professional.name,
      caseId: caseByStudent.get(a.studentId) ?? null,
    })),
    recentCases,
    closedLast30Days,
    medianMinutesToAcknowledge: median(ackMinutes),
  };
}

/**
 * One student's record for the care team. Check-in and questionnaire trends are included only
 * with the student's care-team review consent; alerts, cases and help requests always are,
 * because the student asked for help or a person must act on them. Every view is audited.
 */
export async function getStudentCareProfile(actor: UserActor, studentId: string) {
  assertCan(actor, "student.record.read");
  const institutionId = tenantOf(actor);
  const student = await studentInTenant(db, actor, studentId);
  const [consent, maySeeTrends] = await Promise.all([getConsentState(db, student.id), careTeamMaySeeTrends(db, student.id)]);
  const since = new Date(now().getTime() - 120 * DAY);
  const scope = { institutionId, studentId: student.id };

  const [checkIns, assessments, alerts, cases, helpRequests] = await Promise.all([
    maySeeTrends
      ? db.checkIn.findMany({
          where: { ...scope, createdAt: { gte: since } },
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, mood: true, stress: true, sleep: true },
        })
      : Promise.resolve([]),
    maySeeTrends
      ? db.assessment.findMany({
          where: { ...scope, status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          take: 30,
          include: { score: true },
        })
      : Promise.resolve([]),
    db.alert.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, reference: true, title: true, category: true, status: true, createdAt: true },
    }),
    db.case.findMany({
      where: scope,
      orderBy: { openedAt: "desc" },
      take: 30,
      select: { id: true, reference: true, status: true, priority: true, openedAt: true, closedAt: true },
    }),
    db.helpRequest.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, createdAt: true, caseId: true },
    }),
  ]);

  await recordAudit(db, actor, {
    action: "student.view",
    entityType: "User",
    entityId: student.id,
    metadata: { trendsShown: maySeeTrends },
  });

  return { student, consent, maySeeTrends, checkIns, assessments, alerts, cases, helpRequests };
}
