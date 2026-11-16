import type { Metadata } from "next";
import { BarList, TrendChart } from "@/components/charts";
import { FigureText, PeriodTabs, SuppressionNote } from "@/components/admin/figure";
import { orNotFound } from "@/components/admin/not-found";
import { Notice, PageHeader, Panel, Stat, StatGrid, Table, Td, Th, TriageBadge } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { fmtDay } from "@/lib/format";
import {
  PERIOD_LABELS,
  fmtMean,
  fmtMinutes,
  fmtRate,
  getOverview,
  hiddenText,
  parsePeriodKey,
  periodFor,
} from "@/lib/services/analytics";

export const metadata: Metadata = { title: "Institution overview" };

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireInstitutionAdmin();
  const sp = await searchParams;
  const periodKey = parsePeriodKey(sp.period);
  const o = await orNotFound(getOverview(actor, periodFor(periodKey)));
  const k = o.k;

  const trend = o.wellbeingTrend;
  const hiddenWeeks = trend.filter((w) => w.hidden === "small_group");
  const emptyWeeks = trend.filter((w) => w.hidden === "no_data");
  const series = [
    { label: "Mood (higher is better)", points: trend.map((w) => ({ at: w.weekStart, value: w.mood })) },
    { label: "Stress (higher is more stress)", points: trend.map((w) => ({ at: w.weekStart, value: w.stress })) },
    { label: "Sleep (higher is better)", points: trend.map((w) => ({ at: w.weekStart, value: w.sleep })) },
  ];

  return (
    <>
      <PageHeader
        title="Institution overview"
        description="Group-level figures only. No individual student's check-ins, questionnaires, alerts or notes are shown to administrators."
        actions={<PeriodTabs current={periodKey} basePath="/admin" />}
      />

      <div className="grid gap-6">
        <Panel title="Engagement" description={PERIOD_LABELS[periodKey]}>
          <StatGrid>
            <Stat label="Enrolled students" value={<FigureText figure={o.enrolledStudents} k={k} />} hint="Active student accounts" />
            <Stat label="Active in the period" value={<FigureText figure={o.activeStudents} k={k} />} hint="Checked in or completed a questionnaire" />
            <Stat label="Check-in participation" value={<FigureText figure={o.checkInParticipationRate} k={k} format={fmtRate} />} hint="Share of enrolled students who checked in" />
            <Stat label="Questionnaire completion" value={<FigureText figure={o.assessmentCompletionRate} k={k} format={fmtRate} />} hint="Share of assigned questionnaires completed" />
          </StatGrid>
        </Panel>

        <Panel
          title="Weekly well-being"
          description={
            <>
              Mean self-reported scores (1 to 5) of the <FigureText figure={o.consentingStudents} k={k} /> students who allow their
              check-ins to be included in aggregate analytics.
            </>
          }
        >
          <div className="grid gap-4">
            <TrendChart
              series={series}
              yMin={1}
              yMax={5}
              ticks={[1, 3, 5]}
              label={`Weekly mean mood, stress and sleep, ${PERIOD_LABELS[periodKey].toLowerCase()}`}
              formatValue={(v) => fmtMean(v)}
              emptyText={`Not enough weeks to draw a trend. Each week needs at least ${k} contributing students.`}
            />
            {hiddenWeeks.length ? (
              <Notice tone="info" title={`${hiddenWeeks.length} of ${trend.length} weeks hidden`}>
                Gaps in the line are weeks when fewer than {k} consenting students checked in, so the average could point to
                individuals. Hidden weeks start {hiddenWeeks.map((w) => fmtDay(w.weekStart)).join(", ")}.
              </Notice>
            ) : null}
            {emptyWeeks.length ? (
              <p className="text-sm text-ink-3">
                {emptyWeeks.length} {emptyWeeks.length === 1 ? "week has" : "weeks have"} no check-ins from consenting students.
              </p>
            ) : null}
          </div>
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel
            title="Alerts raised"
            description="Whole institution only. Triage categories describe how soon the care team responds; they are not diagnoses."
          >
            <BarList
              items={o.alertsByCategory.byCategory.map((c) => ({
                key: c.category,
                label: <TriageBadge category={c.category} size="sm" />,
                value: c.count.value,
                note: c.count.value === null && c.count.hidden ? hiddenText(c.count.hidden, k) : undefined,
              }))}
              suppressedText="Hidden"
            />
            <p className="mt-4 text-sm text-ink-2">
              All alerts: <FigureText figure={o.alertsByCategory.total} k={k} />
            </p>
          </Panel>

          <Panel title="Support and services" description={PERIOD_LABELS[periodKey]}>
            <StatGrid className="md:grid-cols-2">
              <Stat label="Open support requests" value={<FigureText figure={o.openSupportRequests} k={k} />} hint="At this moment" />
              <Stat label="Referrals completed" value={<FigureText figure={o.referralCompletionRate} k={k} format={fmtRate} />} hint="Referrals made in the period" />
              <Stat label="Completed appointments" value={<FigureText figure={o.completedAppointments} k={k} />} />
            </StatGrid>
          </Panel>
        </div>

        <Panel title="Time to first human acknowledgement" description="From the moment an alert is raised until a member of the care team acknowledges it.">
          <Table caption="Alert acknowledgement times by triage category">
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Alerts acknowledged</Th>
                <Th>Median</Th>
                <Th>90th percentile</Th>
              </tr>
            </thead>
            <tbody>
              {o.responseTimes.byCategory.map((c) => (
                <tr key={c.category}>
                  <Td>
                    <TriageBadge category={c.category} size="sm" />
                  </Td>
                  <Td className="font-mono tabular-nums">
                    <FigureText figure={c.time.alerts} k={k} />
                  </Td>
                  <Td className="font-mono tabular-nums">
                    <FigureText figure={c.time.medianMinutes} k={k} format={fmtMinutes} />
                  </Td>
                  <Td className="font-mono tabular-nums">
                    <FigureText figure={c.time.p90Minutes} k={k} format={fmtMinutes} />
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-medium">All categories</Td>
                <Td className="font-mono tabular-nums">
                  <FigureText figure={o.responseTimes.overall.alerts} k={k} />
                </Td>
                <Td className="font-mono tabular-nums">
                  <FigureText figure={o.responseTimes.overall.medianMinutes} k={k} format={fmtMinutes} />
                </Td>
                <Td className="font-mono tabular-nums">
                  <FigureText figure={o.responseTimes.overall.p90Minutes} k={k} format={fmtMinutes} />
                </Td>
              </tr>
            </tbody>
          </Table>
        </Panel>

        <SuppressionNote k={k} />
      </div>
    </>
  );
}
