import type { Metadata } from "next";
import { BarList } from "@/components/charts";
import { FigureText, PeriodTabs, SuppressionNote } from "@/components/admin/figure";
import { orNotFound } from "@/components/admin/not-found";
import { Notice, PageHeader, Panel, Stat, StatGrid } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import {
  FEEDBACK_LABEL,
  PERIOD_LABELS,
  fmtMinutes,
  fmtRate,
  getInterventionMetrics,
  hiddenText,
  parsePeriodKey,
  periodFor,
} from "@/lib/services/analytics";

export const metadata: Metadata = { title: "Interventions" };

export default async function InterventionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireInstitutionAdmin();
  const sp = await searchParams;
  const periodKey = parsePeriodKey(sp.period);
  const m = await orNotFound(getInterventionMetrics(actor, periodFor(periodKey)));
  const k = m.k;

  return (
    <>
      <PageHeader
        title="Interventions"
        description="How the care pathway is working: reviews, referrals, attendance and follow-up. Whole institution only."
        actions={<PeriodTabs current={periodKey} basePath="/admin/interventions" />}
      />

      <div className="grid gap-6">
        <Notice tone="warning" title="Read with care">
          {m.caution}
        </Notice>

        <Panel title="Review and response" description={PERIOD_LABELS[periodKey]}>
          <StatGrid>
            <Stat label="Alerts reviewed" value={<FigureText figure={m.alertsReviewed} k={k} />} />
            <Stat label="Median time to first review" value={<FigureText figure={m.reviewTime.medianMinutes} k={k} format={fmtMinutes} />} />
            <Stat label="90th percentile time to review" value={<FigureText figure={m.reviewTime.p90Minutes} k={k} format={fmtMinutes} />} />
            <Stat label="Cases awaiting action" value={<FigureText figure={m.casesAwaitingAction} k={k} />} hint="Open cases not yet acknowledged or past their review date, at this moment" />
          </StatGrid>
        </Panel>

        <Panel title="Referrals and follow-up" description={PERIOD_LABELS[periodKey]}>
          <StatGrid>
            <Stat label="Referrals initiated" value={<FigureText figure={m.referralsInitiated} k={k} />} />
            <Stat label="Appointment attendance" value={<FigureText figure={m.appointmentAttendanceRate} k={k} format={fmtRate} />} hint="Attended out of attended plus missed" />
            <Stat label="Follow-ups completed" value={<FigureText figure={m.followUpCompletionRate} k={k} format={fmtRate} />} hint="Out of follow-ups that were due" />
            <Stat label="Missed-concern cases" value={<FigureText figure={m.missedConcernCases} k={k} />} hint="Cases the care team recorded as missed by the rules" />
          </StatGrid>
        </Panel>

        <Panel
          title="Reviewer feedback on alerts"
          description="When closing an alert, reviewers say whether the flag was appropriate. Many flags marked not needed suggest rules that fire too often; under-triaged concerns suggest rules that fire too late."
        >
          <BarList
            items={m.feedback.byKind.map((f) => ({
              key: f.feedback,
              label: FEEDBACK_LABEL[f.feedback],
              value: f.count.value,
              note: f.count.value === null && f.count.hidden ? hiddenText(f.count.hidden, k) : undefined,
            }))}
            suppressedText="Hidden"
          />
          <p className="mt-4 text-sm text-ink-2">
            Alerts with feedback: <FigureText figure={m.feedback.total} k={k} />
          </p>
          <p className="mt-2 text-sm text-ink-3">Clinicians adjust the triage rules. Share this feedback with your clinical lead.</p>
        </Panel>

        <SuppressionNote k={k} />
      </div>
    </>
  );
}
