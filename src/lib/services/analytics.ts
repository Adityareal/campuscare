import type { ReviewerFeedback, TriageCategory } from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, now } from "@/lib/clock";
import { db, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { effectiveK, reportable, suppressCells, type Cell, type ReportedCell } from "@/lib/privacy/suppression";
import { OPEN_CASE_STATUSES } from "@/lib/services/cases";
import { getInstitutionSettings } from "@/lib/services/config";

/*
 * Institution analytics. Every number here describes a group of students and is released only
 * through reportable() or suppressCells() with k = the institution's minimum group size.
 * Nothing in this module returns a student id, a name or an individual answer.
 * Alerts and cases are reported for the whole institution only, never per department or year.
 */

// ---------- Periods ----------

export const PERIODS = { "30d": 30, "90d": 90, "365d": 365 } as const;
export type PeriodKey = keyof typeof PERIODS;
export type Period = { from: Date; to: Date };

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
};

export function parsePeriodKey(value: string | string[] | undefined): PeriodKey {
  const v = Array.isArray(value) ? value[0] : value;
  return v && Object.prototype.hasOwnProperty.call(PERIODS, v) ? (v as PeriodKey) : "30d";
}

export function periodFor(key: PeriodKey, to: Date = now()): Period {
  return { from: new Date(to.getTime() - PERIODS[key] * DAY), to };
}

const MAX_PERIOD_DAYS = 400;

function checkPeriod(p: Period): void {
  if (!(p.from instanceof Date) || !(p.to instanceof Date) || Number.isNaN(p.from.getTime()) || Number.isNaN(p.to.getTime())) {
    fail("VALIDATION", "The reporting period is not valid.");
  }
  if (p.from.getTime() >= p.to.getTime()) fail("VALIDATION", "The start of the period must be before its end.");
  if (p.to.getTime() - p.from.getTime() > MAX_PERIOD_DAYS * DAY) fail("VALIDATION", "Choose a period of at most 400 days.");
}

// ---------- Figures ----------

export type HiddenReason = "small_group" | "complementary" | "no_data";

/** A released number, or null with the reason it is not shown. */
export type Figure = { value: number | null; hidden: HiddenReason | null };

const NO_DATA: Figure = { value: null, hidden: "no_data" };

/** Releases a value whose base covers `n` distinct students. */
function figure(n: number, value: number | null, k: number): Figure {
  if (n === 0 || value === null) return NO_DATA;
  const v = reportable(n, value, k);
  return v === null ? { value: null, hidden: "small_group" } : { value: v, hidden: null };
}

function cellFigure(c: ReportedCell<number>): Figure {
  if (c.suppressed || c.value === null) return { value: null, hidden: c.reason ?? "small_group" };
  return { value: c.value, hidden: null };
}

/** Plain explanation shown wherever a value is withheld. */
export function hiddenText(reason: HiddenReason, k: number): string {
  switch (reason) {
    case "small_group":
      return `Hidden: fewer than ${k} students`;
    case "complementary":
      return "Hidden: protects a small group elsewhere in this table";
    case "no_data":
      return "No data in this period";
  }
}

export const CATEGORIES: TriageCategory[] = ["URGENT", "PRIORITY", "MONITOR", "ROUTINE"];
export const CATEGORY_LABEL: Record<TriageCategory, string> = {
  URGENT: "Urgent",
  PRIORITY: "Priority",
  MONITOR: "Monitor",
  ROUTINE: "Routine",
};

export const FEEDBACK_KINDS: ReviewerFeedback[] = ["APPROPRIATE", "NOT_NEEDED", "UNDER_TRIAGED"];
export const FEEDBACK_LABEL: Record<ReviewerFeedback, string> = {
  APPROPRIATE: "Flag was appropriate",
  NOT_NEEDED: "Flag was not needed",
  UNDER_TRIAGED: "Concern was under-triaged",
};

export const OUTCOME_CAUTION =
  "Fewer alerts or lower screening scores are not evidence of better outcomes. They can also mean that fewer students are checking in or that concerns are going unreported. Read these figures together with participation, and discuss them with your care team before drawing conclusions.";

// ---------- Helpers ----------

function round(v: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function distinct(ids: Iterable<string>): number {
  return new Set(ids).size;
}

/** Nearest-rank quantile of an ascending list. */
function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx] ?? null;
}

type Rated = { studentId: string; mood: number | null; stress: number | null; sleep: number | null };

/** Mean of per-student means, so a student who checks in daily does not outweigh one who
 * checks in weekly. `n` is the number of contributing students. */
function meanOfStudentMeans(rows: readonly Rated[], field: "mood" | "stress" | "sleep"): { n: number; mean: number | null } {
  const per = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const v = r[field];
    if (v === null) continue;
    const e = per.get(r.studentId) ?? { sum: 0, count: 0 };
    e.sum += v;
    e.count += 1;
    per.set(r.studentId, e);
  }
  if (!per.size) return { n: 0, mean: null };
  let total = 0;
  for (const e of per.values()) total += e.sum / e.count;
  return { n: per.size, mean: round(total / per.size) };
}

/** Students whose latest AGGREGATE_ANALYTICS consent row is GRANTED. */
async function consentingStudentIds(client: DbLike, institutionId: string): Promise<Set<string>> {
  const rows = await client.consentRecord.findMany({
    where: { institutionId, scope: "AGGREGATE_ANALYTICS" },
    orderBy: { recordedAt: "desc" },
    select: { userId: true, decision: true },
  });
  const seen = new Set<string>();
  const granted = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    if (r.decision === "GRANTED") granted.add(r.userId);
  }
  return granted;
}

async function contextFor(actor: UserActor): Promise<{ institutionId: string; k: number }> {
  assertCan(actor, "analytics.aggregate.read");
  const institutionId = tenantOf(actor);
  const settings = await getInstitutionSettings(db, institutionId);
  return { institutionId, k: effectiveK(settings.minCohortSize) };
}

async function activeStudentIds(institutionId: string): Promise<Set<string>> {
  const rows = await db.user.findMany({ where: { institutionId, role: "STUDENT", status: "ACTIVE" }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

// ---------- Response times ----------

export type ResponseTime = { alerts: Figure; medianMinutes: Figure; p90Minutes: Figure };

function responseTime(rows: readonly { studentId: string; minutes: number }[], k: number): ResponseTime {
  const n = distinct(rows.map((r) => r.studentId));
  const sorted = rows.map((r) => r.minutes).sort((a, b) => a - b);
  const med = quantile(sorted, 0.5);
  const p90 = quantile(sorted, 0.9);
  return {
    alerts: figure(n, rows.length, k),
    medianMinutes: figure(n, med === null ? null : round(med, 0), k),
    p90Minutes: figure(n, p90 === null ? null : round(p90, 0), k),
  };
}

/** Counts per key, released with complementary suppression because the total is shown too.
 * Keys with no students are reported as an honest zero and kept out of the suppression set. */
function countBreakdown<K extends string>(
  keys: readonly K[],
  rows: readonly { key: K; studentId: string }[],
  k: number,
): { total: Figure; byKey: { key: K; count: Figure }[] } {
  const students = new Map<K, Set<string>>();
  const counts = new Map<K, number>();
  for (const r of rows) {
    const s = students.get(r.key) ?? new Set<string>();
    s.add(r.studentId);
    students.set(r.key, s);
    counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
  }
  const cells: Cell<number>[] = keys
    .filter((key) => (students.get(key)?.size ?? 0) > 0)
    .map((key) => ({ key, n: students.get(key)?.size ?? 0, value: counts.get(key) ?? 0 }));
  const reported = new Map(suppressCells(cells, k, { totalShown: true }).map((c) => [c.key, c]));
  return {
    total: figure(distinct(rows.map((r) => r.studentId)), rows.length, k),
    byKey: keys.map((key) => {
      const c = reported.get(key);
      return { key, count: c ? cellFigure(c) : { value: 0, hidden: null } };
    }),
  };
}

// ---------- Overview ----------

export type WeekPoint = {
  weekStart: Date;
  contributors: number | null;
  mood: number | null;
  stress: number | null;
  sleep: number | null;
  hidden: HiddenReason | null;
};

export type Overview = {
  period: Period;
  k: number;
  enrolledStudents: Figure;
  activeStudents: Figure;
  checkInParticipationRate: Figure;
  assessmentCompletionRate: Figure;
  consentingStudents: Figure;
  wellbeingTrend: WeekPoint[];
  openSupportRequests: Figure;
  referralCompletionRate: Figure;
  completedAppointments: Figure;
  responseTimes: { overall: ResponseTime; byCategory: { category: TriageCategory; time: ResponseTime }[] };
  alertsByCategory: { total: Figure; byCategory: { category: TriageCategory; count: Figure }[] };
};

export async function getOverview(actor: UserActor, period: Period): Promise<Overview> {
  checkPeriod(period);
  const { institutionId, k } = await contextFor(actor);
  const range = { gte: period.from, lte: period.to };

  const [enrolled, consenting, checkIns, assessments, openHelp, referrals, appointments, alerts] = await Promise.all([
    activeStudentIds(institutionId),
    consentingStudentIds(db, institutionId),
    db.checkIn.findMany({
      where: { institutionId, createdAt: range },
      select: { studentId: true, createdAt: true, mood: true, stress: true, sleep: true },
    }),
    db.assessment.findMany({
      where: { institutionId, status: { not: "CANCELLED" }, OR: [{ assignedAt: range }, { completedAt: range }] },
      select: { studentId: true, status: true, assignedAt: true, completedAt: true },
    }),
    db.helpRequest.findMany({
      where: { institutionId, OR: [{ caseId: null }, { case: { status: { in: [...OPEN_CASE_STATUSES] } } }] },
      select: { studentId: true },
    }),
    db.referral.findMany({
      where: { institutionId, createdAt: range },
      select: { studentId: true, status: true, appointments: { select: { status: true } } },
    }),
    db.appointment.findMany({ where: { institutionId, status: "COMPLETED", startsAt: range }, select: { studentId: true } }),
    db.alert.findMany({
      where: { institutionId, createdAt: range },
      select: { studentId: true, category: true, createdAt: true, acknowledgedAt: true, acknowledgedById: true },
    }),
  ]);

  const enrolledCount = enrolled.size;
  const ownCheckIns = checkIns.filter((c) => enrolled.has(c.studentId));
  const checkedIn = new Set(ownCheckIns.map((c) => c.studentId));
  const completedInPeriod = assessments.filter(
    (a) => a.status === "COMPLETED" && a.completedAt && a.completedAt >= period.from && a.completedAt <= period.to && enrolled.has(a.studentId),
  );
  const active = new Set([...checkedIn, ...completedInPeriod.map((a) => a.studentId)]);

  const assigned = assessments.filter((a) => a.assignedAt >= period.from && a.assignedAt <= period.to);
  const assignedCompleted = assigned.filter((a) => a.status === "COMPLETED").length;

  // Well-being trend: consenting students only, one point per week from the start of the period.
  const consentingRows = checkIns.filter((c) => consenting.has(c.studentId));
  const weeks = Math.max(1, Math.ceil((period.to.getTime() - period.from.getTime()) / (7 * DAY)));
  const buckets: Rated[][] = Array.from({ length: weeks }, () => []);
  for (const c of consentingRows) {
    const idx = Math.min(weeks - 1, Math.floor((c.createdAt.getTime() - period.from.getTime()) / (7 * DAY)));
    buckets[idx]?.push(c);
  }
  const wellbeingTrend: WeekPoint[] = buckets.map((rows, i) => {
    const weekStart = new Date(period.from.getTime() + i * 7 * DAY);
    const contributors = distinct(rows.map((r) => r.studentId));
    if (contributors === 0) return { weekStart, contributors: null, mood: null, stress: null, sleep: null, hidden: "no_data" };
    if (reportable(contributors, contributors, k) === null) {
      return { weekStart, contributors: null, mood: null, stress: null, sleep: null, hidden: "small_group" };
    }
    const mood = meanOfStudentMeans(rows, "mood");
    const stress = meanOfStudentMeans(rows, "stress");
    const sleep = meanOfStudentMeans(rows, "sleep");
    return {
      weekStart,
      contributors,
      mood: mood.mean === null ? null : reportable(mood.n, mood.mean, k),
      stress: stress.mean === null ? null : reportable(stress.n, stress.mean, k),
      sleep: sleep.mean === null ? null : reportable(sleep.n, sleep.mean, k),
      hidden: null,
    };
  });

  const completedReferrals = referrals.filter((r) => r.status === "ATTENDED" || r.appointments.some((a) => a.status === "COMPLETED"));

  const acknowledged = alerts
    .filter((a) => a.acknowledgedAt && a.acknowledgedById)
    .map((a) => ({
      studentId: a.studentId,
      category: a.category,
      minutes: ((a.acknowledgedAt as Date).getTime() - a.createdAt.getTime()) / 60_000,
    }));

  const alertCounts = countBreakdown(
    CATEGORIES,
    alerts.map((a) => ({ key: a.category, studentId: a.studentId })),
    k,
  );

  return {
    period,
    k,
    enrolledStudents: figure(enrolledCount, enrolledCount, k),
    activeStudents: figure(enrolledCount, active.size, k),
    checkInParticipationRate: figure(enrolledCount, enrolledCount ? round(checkedIn.size / enrolledCount, 4) : null, k),
    assessmentCompletionRate: figure(
      distinct(assigned.map((a) => a.studentId)),
      assigned.length ? round(assignedCompleted / assigned.length, 4) : null,
      k,
    ),
    consentingStudents: figure(enrolledCount, [...consenting].filter((id) => enrolled.has(id)).length, k),
    wellbeingTrend,
    openSupportRequests: figure(distinct(openHelp.map((h) => h.studentId)), openHelp.length, k),
    referralCompletionRate: figure(
      distinct(referrals.map((r) => r.studentId)),
      referrals.length ? round(completedReferrals.length / referrals.length, 4) : null,
      k,
    ),
    completedAppointments: figure(distinct(appointments.map((a) => a.studentId)), appointments.length, k),
    responseTimes: {
      overall: responseTime(acknowledged, k),
      byCategory: CATEGORIES.map((category) => ({ category, time: responseTime(acknowledged.filter((a) => a.category === category), k) })),
    },
    alertsByCategory: {
      total: alertCounts.total,
      byCategory: alertCounts.byKey.map((c) => ({ category: c.key, count: c.count })),
    },
  };
}

// ---------- Group breakdown ----------

export type GroupDimension = "department" | "year";

export type GroupRow = {
  key: string;
  label: string;
  hidden: HiddenReason | null;
  enrolled: Figure;
  participationRate: Figure;
  meanMood: Figure;
  meanStress: Figure;
};

export type GroupBreakdown = {
  period: Period;
  k: number;
  dimension: GroupDimension;
  rows: GroupRow[];
  total: { enrolled: Figure; participationRate: Figure };
  hiddenGroups: number;
};

type GroupCell = { enrolled: number; participation: number; moodN: number; mood: number | null; stressN: number; stress: number | null };

export async function getGroupBreakdown(actor: UserActor, input: Period & { dimension: GroupDimension }): Promise<GroupBreakdown> {
  const period: Period = { from: input.from, to: input.to };
  checkPeriod(period);
  if (input.dimension !== "department" && input.dimension !== "year") fail("VALIDATION", "Choose department or year.");
  const { institutionId, k } = await contextFor(actor);

  const [students, departments, consenting, checkIns] = await Promise.all([
    db.user.findMany({
      where: { institutionId, role: "STUDENT", status: "ACTIVE", student: { isNot: null } },
      select: { id: true, student: { select: { departmentId: true, academicYear: true } } },
    }),
    db.department.findMany({ where: { institutionId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    consentingStudentIds(db, institutionId),
    db.checkIn.findMany({
      where: { institutionId, createdAt: { gte: period.from, lte: period.to } },
      select: { studentId: true, mood: true, stress: true, sleep: true },
    }),
  ]);

  const groupOf = new Map<string, string>();
  for (const s of students) {
    if (!s.student) continue;
    groupOf.set(s.id, input.dimension === "department" ? s.student.departmentId : String(s.student.academicYear));
  }

  const groups: { key: string; label: string }[] =
    input.dimension === "department"
      ? departments.map((d) => ({ key: d.id, label: d.name }))
      : [...new Set([...groupOf.values()])]
          .map(Number)
          .sort((a, b) => a - b)
          .map((y) => ({ key: String(y), label: `Year ${y}` }));

  const members = new Map<string, string[]>();
  for (const [studentId, key] of groupOf) {
    const list = members.get(key) ?? [];
    list.push(studentId);
    members.set(key, list);
  }
  const checkInsByStudent = new Map<string, Rated[]>();
  for (const c of checkIns) {
    if (!groupOf.has(c.studentId)) continue;
    const list = checkInsByStudent.get(c.studentId) ?? [];
    list.push(c);
    checkInsByStudent.set(c.studentId, list);
  }

  const computed = new Map<string, GroupCell>();
  for (const g of groups) {
    const ids = members.get(g.key) ?? [];
    const participated = ids.filter((id) => checkInsByStudent.has(id)).length;
    const consentRows = ids.filter((id) => consenting.has(id)).flatMap((id) => checkInsByStudent.get(id) ?? []);
    const mood = meanOfStudentMeans(consentRows, "mood");
    const stress = meanOfStudentMeans(consentRows, "stress");
    computed.set(g.key, {
      enrolled: ids.length,
      participation: ids.length ? round(participated / ids.length, 4) : 0,
      moodN: mood.n,
      mood: mood.mean,
      stressN: stress.n,
      stress: stress.mean,
    });
  }

  const cells: Cell<GroupCell>[] = groups
    .map((g) => ({ key: g.key, n: computed.get(g.key)?.enrolled ?? 0, value: computed.get(g.key) as GroupCell }))
    .filter((c) => c.n > 0);
  const reported = new Map(suppressCells(cells, k, { totalShown: true }).map((c) => [c.key, c]));

  const rows: GroupRow[] = groups.map((g) => {
    const c = reported.get(g.key);
    if (!c) {
      return { key: g.key, label: g.label, hidden: "no_data", enrolled: { value: 0, hidden: null }, participationRate: NO_DATA, meanMood: NO_DATA, meanStress: NO_DATA };
    }
    if (c.suppressed || !c.value) {
      const reason = c.reason ?? "small_group";
      const hiddenFig: Figure = { value: null, hidden: reason };
      return { key: g.key, label: g.label, hidden: reason, enrolled: hiddenFig, participationRate: hiddenFig, meanMood: hiddenFig, meanStress: hiddenFig };
    }
    const v = c.value;
    return {
      key: g.key,
      label: g.label,
      hidden: null,
      enrolled: figure(v.enrolled, v.enrolled, k),
      participationRate: figure(v.enrolled, v.participation, k),
      meanMood: figure(v.moodN, v.mood, k),
      meanStress: figure(v.stressN, v.stress, k),
    };
  });

  const totalEnrolled = groupOf.size;
  const totalParticipated = [...groupOf.keys()].filter((id) => checkInsByStudent.has(id)).length;
  return {
    period,
    k,
    dimension: input.dimension,
    rows,
    total: {
      enrolled: figure(totalEnrolled, totalEnrolled, k),
      participationRate: figure(totalEnrolled, totalEnrolled ? round(totalParticipated / totalEnrolled, 4) : null, k),
    },
    hiddenGroups: rows.filter((r) => r.hidden === "small_group" || r.hidden === "complementary").length,
  };
}

// ---------- Intervention metrics ----------

export type InterventionMetrics = {
  period: Period;
  k: number;
  alertsReviewed: Figure;
  reviewTime: { medianMinutes: Figure; p90Minutes: Figure };
  referralsInitiated: Figure;
  appointmentAttendanceRate: Figure;
  followUpCompletionRate: Figure;
  casesAwaitingAction: Figure;
  feedback: { total: Figure; byKind: { feedback: ReviewerFeedback; count: Figure }[] };
  missedConcernCases: Figure;
  caution: string;
};

export async function getInterventionMetrics(actor: UserActor, period: Period): Promise<InterventionMetrics> {
  checkPeriod(period);
  const { institutionId, k } = await contextFor(actor);
  const range = { gte: period.from, lte: period.to };
  const t = now();

  const [reviewed, referrals, appointments, followUps, awaiting, missed] = await Promise.all([
    db.alert.findMany({
      where: { institutionId, reviewedAt: range, reviewedById: { not: null } },
      select: { studentId: true, createdAt: true, reviewedAt: true, reviewerFeedback: true },
    }),
    db.referral.findMany({ where: { institutionId, createdAt: range }, select: { studentId: true } }),
    db.appointment.findMany({
      where: { institutionId, startsAt: range, status: { in: ["COMPLETED", "NO_SHOW"] } },
      select: { studentId: true, status: true },
    }),
    db.followUp.findMany({
      where: {
        institutionId,
        dueAt: { gte: period.from, lte: period.to < t ? period.to : t },
        status: { in: ["DONE", "MISSED", "SCHEDULED"] },
      },
      select: { studentId: true, status: true },
    }),
    db.case.findMany({
      where: {
        institutionId,
        status: { in: [...OPEN_CASE_STATUSES] },
        OR: [{ acknowledgedAt: null }, { nextReviewAt: { lte: t } }],
      },
      select: { studentId: true },
    }),
    db.case.findMany({ where: { institutionId, missedConcern: true, openedAt: range }, select: { studentId: true } }),
  ]);

  const reviewMinutes = reviewed.map((a) => ({
    studentId: a.studentId,
    minutes: ((a.reviewedAt as Date).getTime() - a.createdAt.getTime()) / 60_000,
  }));
  const reviewTimes = responseTime(reviewMinutes, k);

  const attended = appointments.filter((a) => a.status === "COMPLETED").length;
  const doneFollowUps = followUps.filter((f) => f.status === "DONE").length;

  const withFeedback = reviewed.filter((a): a is typeof a & { reviewerFeedback: ReviewerFeedback } => a.reviewerFeedback !== null);
  const feedback = countBreakdown(
    FEEDBACK_KINDS,
    withFeedback.map((a) => ({ key: a.reviewerFeedback, studentId: a.studentId })),
    k,
  );

  return {
    period,
    k,
    alertsReviewed: reviewTimes.alerts,
    reviewTime: { medianMinutes: reviewTimes.medianMinutes, p90Minutes: reviewTimes.p90Minutes },
    referralsInitiated: figure(distinct(referrals.map((r) => r.studentId)), referrals.length, k),
    appointmentAttendanceRate: figure(
      distinct(appointments.map((a) => a.studentId)),
      appointments.length ? round(attended / appointments.length, 4) : null,
      k,
    ),
    followUpCompletionRate: figure(
      distinct(followUps.map((f) => f.studentId)),
      followUps.length ? round(doneFollowUps / followUps.length, 4) : null,
      k,
    ),
    casesAwaitingAction: figure(distinct(awaiting.map((c) => c.studentId)), awaiting.length, k),
    feedback: { total: feedback.total, byKind: feedback.byKey.map((f) => ({ feedback: f.key, count: f.count })) },
    missedConcernCases: figure(distinct(missed.map((c) => c.studentId)), missed.length, k),
    caution: OUTCOME_CAUTION,
  };
}

// ---------- Display helpers shared by pages and reports ----------

export function fmtRate(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtMean(v: number): string {
  return v.toFixed(1);
}

export function fmtCount(v: number): string {
  return v.toLocaleString("en-IN");
}

export function fmtMinutes(v: number): string {
  if (v < 60) return `${Math.round(v)} min`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** Formats a figure, or explains why it is hidden. */
export function showFigure(f: Figure, k: number, format: (v: number) => string = fmtCount): string {
  return f.value === null ? hiddenText(f.hidden ?? "small_group", k) : format(f.value);
}
