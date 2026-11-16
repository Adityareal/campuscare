import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { fmtDate, isoDay } from "@/lib/format";
import {
  CATEGORY_LABEL,
  FEEDBACK_LABEL,
  OUTCOME_CAUTION,
  fmtCount,
  fmtMean,
  fmtMinutes,
  fmtRate,
  getGroupBreakdown,
  getInterventionMetrics,
  getOverview,
  hiddenText,
  showFigure,
  type GroupBreakdown,
  type Period,
} from "@/lib/services/analytics";

/*
 * Institutional reports. Every value is produced by the analytics service, so small-group
 * suppression is already applied before a report is assembled; this module only formats.
 * Reports never contain an individual student's data or any clinical note.
 */

export const REPORT_KINDS = ["MONTHLY", "QUARTERLY", "ANNUAL", "GROUP", "INTERVENTION"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_INFO: Record<ReportKind, { label: string; months: number; description: string }> = {
  MONTHLY: { label: "Monthly summary", months: 1, description: "Engagement, well-being trend, alerts and response times for one month." },
  QUARTERLY: { label: "Quarterly summary", months: 3, description: "The same summary over three months." },
  ANNUAL: { label: "Annual summary", months: 12, description: "The same summary over twelve months." },
  GROUP: { label: "Departments and years", months: 3, description: "Participation and well-being by department and by year of study over three months." },
  INTERVENTION: { label: "Interventions", months: 3, description: "Reviews, referrals, attendance and follow-up over three months." },
};

export function isReportKind(v: string): v is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(v);
}

/** Reads "YYYY-MM-DD" as the end of that day in India time; anything else means now. */
export function parsePeriodEnd(value: string | null | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T23:59:59+05:30`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return now();
}

export type ReportSection = { title: string; note?: string; columns: string[]; rows: string[][] };

export type Report = {
  kind: ReportKind;
  title: string;
  institutionName: string;
  period: Period;
  generatedAt: Date;
  k: number;
  sections: ReportSection[];
};

function periodEnding(kind: ReportKind, periodEnd: Date): Period {
  if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime())) fail("VALIDATION", "Choose a valid end date for the report.");
  const t = now();
  const to = periodEnd.getTime() > t.getTime() ? t : periodEnd;
  const from = new Date(to.getTime());
  from.setUTCMonth(from.getUTCMonth() - REPORT_KIND_INFO[kind].months);
  return { from, to };
}

async function summarySections(actor: UserActor, period: Period): Promise<{ k: number; sections: ReportSection[] }> {
  const o = await getOverview(actor, period);
  const k = o.k;
  const sections: ReportSection[] = [
    {
      title: "Engagement",
      columns: ["Measure", "Value"],
      rows: [
        ["Enrolled students (active accounts)", showFigure(o.enrolledStudents, k)],
        ["Students active in the period", showFigure(o.activeStudents, k)],
        ["Check-in participation", showFigure(o.checkInParticipationRate, k, fmtRate)],
        ["Questionnaire completion", showFigure(o.assessmentCompletionRate, k, fmtRate)],
        ["Students who allow aggregate analytics", showFigure(o.consentingStudents, k)],
      ],
    },
    {
      title: "Weekly well-being of consenting students",
      note: `Mean self-reported scores on a 1 to 5 scale. A week with fewer than ${k} contributing students is hidden.`,
      columns: ["Week starting", "Students", "Mood", "Stress", "Sleep"],
      rows: o.wellbeingTrend.map((w) =>
        w.hidden
          ? [fmtDate(w.weekStart), hiddenText(w.hidden, k), "", "", ""]
          : [
              fmtDate(w.weekStart),
              w.contributors === null ? hiddenText("small_group", k) : fmtCount(w.contributors),
              w.mood === null ? "-" : fmtMean(w.mood),
              w.stress === null ? "-" : fmtMean(w.stress),
              w.sleep === null ? "-" : fmtMean(w.sleep),
            ],
      ),
    },
    {
      title: "Support and services",
      columns: ["Measure", "Value"],
      rows: [
        ["Open support requests (at the time of the report)", showFigure(o.openSupportRequests, k)],
        ["Referrals completed", showFigure(o.referralCompletionRate, k, fmtRate)],
        ["Completed appointments", showFigure(o.completedAppointments, k)],
      ],
    },
    {
      title: "Alerts raised, whole institution",
      note: "Triage categories are operational labels for how soon the care team responds. They are not diagnoses.",
      columns: ["Category", "Alerts"],
      rows: [
        ...o.alertsByCategory.byCategory.map((c) => [CATEGORY_LABEL[c.category], showFigure(c.count, k)]),
        ["All categories", showFigure(o.alertsByCategory.total, k)],
      ],
    },
    {
      title: "Time from alert to first human acknowledgement",
      columns: ["Category", "Alerts acknowledged", "Median", "90th percentile"],
      rows: [
        ...o.responseTimes.byCategory.map((c) => [
          CATEGORY_LABEL[c.category],
          showFigure(c.time.alerts, k),
          showFigure(c.time.medianMinutes, k, fmtMinutes),
          showFigure(c.time.p90Minutes, k, fmtMinutes),
        ]),
        [
          "All categories",
          showFigure(o.responseTimes.overall.alerts, k),
          showFigure(o.responseTimes.overall.medianMinutes, k, fmtMinutes),
          showFigure(o.responseTimes.overall.p90Minutes, k, fmtMinutes),
        ],
      ],
    },
  ];
  return { k, sections };
}

function groupSection(title: string, g: GroupBreakdown): ReportSection {
  const k = g.k;
  return {
    title,
    note:
      g.hiddenGroups > 0
        ? `Groups with fewer than ${k} students are hidden. When exactly one group is hidden, the next smallest is hidden too so it cannot be worked out from the total.`
        : undefined,
    columns: ["Group", "Enrolled", "Check-in participation", "Mean mood", "Mean stress"],
    rows: [
      ...g.rows.map((r) => [
        r.label,
        showFigure(r.enrolled, k),
        showFigure(r.participationRate, k, fmtRate),
        showFigure(r.meanMood, k, fmtMean),
        showFigure(r.meanStress, k, fmtMean),
      ]),
      ["Total", showFigure(g.total.enrolled, k), showFigure(g.total.participationRate, k, fmtRate), "", ""],
    ],
  };
}

export async function buildReport(actor: UserActor, input: { kind: ReportKind; periodEnd: Date }): Promise<Report> {
  assertCan(actor, "report.generate");
  const institutionId = tenantOf(actor);
  if (!isReportKind(input.kind)) fail("VALIDATION", "Choose a report type.");
  const period = periodEnding(input.kind, input.periodEnd);
  const institution = await db.institution.findFirst({ where: { id: institutionId }, select: { name: true } });
  if (!institution) fail("NOT_FOUND", "Institution not found.");

  let k: number;
  let sections: ReportSection[];
  if (input.kind === "GROUP") {
    const [dept, year] = await Promise.all([
      getGroupBreakdown(actor, { ...period, dimension: "department" }),
      getGroupBreakdown(actor, { ...period, dimension: "year" }),
    ]);
    k = dept.k;
    sections = [groupSection("By department", dept), groupSection("By year of study", year)];
  } else if (input.kind === "INTERVENTION") {
    const m = await getInterventionMetrics(actor, period);
    k = m.k;
    sections = [
      {
        title: "Care team activity",
        note: OUTCOME_CAUTION,
        columns: ["Measure", "Value"],
        rows: [
          ["Alerts reviewed", showFigure(m.alertsReviewed, k)],
          ["Median time to first human review", showFigure(m.reviewTime.medianMinutes, k, fmtMinutes)],
          ["90th percentile time to first human review", showFigure(m.reviewTime.p90Minutes, k, fmtMinutes)],
          ["Referrals initiated", showFigure(m.referralsInitiated, k)],
          ["Appointment attendance", showFigure(m.appointmentAttendanceRate, k, fmtRate)],
          ["Follow-ups completed", showFigure(m.followUpCompletionRate, k, fmtRate)],
          ["Cases awaiting action (at the time of the report)", showFigure(m.casesAwaitingAction, k)],
          ["Cases recorded as a missed concern", showFigure(m.missedConcernCases, k)],
        ],
      },
      {
        title: "Reviewer feedback on alerts",
        note: "A high share of flags marked not needed suggests rules that fire too often. Under-triaged concerns suggest rules that fire too late.",
        columns: ["Feedback", "Alerts"],
        rows: [
          ...m.feedback.byKind.map((f) => [FEEDBACK_LABEL[f.feedback], showFigure(f.count, k)]),
          ["All feedback", showFigure(m.feedback.total, k)],
        ],
      },
    ];
  } else {
    const s = await summarySections(actor, period);
    k = s.k;
    sections = s.sections;
  }

  const generatedAt = now();
  await db.$transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: "report.generate",
      entityType: "Report",
      entityId: null,
      metadata: { kind: input.kind, from: isoDay(period.from), to: isoDay(period.to) },
    });
  });

  return {
    kind: input.kind,
    title: REPORT_KIND_INFO[input.kind].label,
    institutionName: institution.name,
    period,
    generatedAt,
    k,
    sections,
  };
}

/** Quotes a CSV cell and neutralises spreadsheet formulas. */
function csvCell(value: string): string {
  const safe = /^[=+@\t\r]/.test(value) || /^-[^\s]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(report: Report): string {
  const lines: string[][] = [
    ["Report", report.title],
    ["Institution", report.institutionName],
    ["Period start", isoDay(report.period.from)],
    ["Period end", isoDay(report.period.to)],
    ["Generated", report.generatedAt.toISOString()],
    ["Minimum group size", String(report.k)],
    [],
  ];
  for (const s of report.sections) {
    lines.push([s.title]);
    if (s.note) lines.push([s.note]);
    lines.push(s.columns);
    for (const r of s.rows) lines.push(r);
    lines.push([]);
  }
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function reportFileName(report: Report): string {
  return `campuscare-${report.kind.toLowerCase()}-${isoDay(report.period.to)}.csv`;
}
