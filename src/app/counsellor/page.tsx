import Link from "next/link";
import { ButtonLink, EmptyState, Notice, PageHeader, Panel, Ref, Stat, StatGrid, StatusPill, TriageBadge, When, linkClass } from "@/components/ui";
import { CASE_STATUS_LABEL } from "@/components/care/labels";
import { requireCareTeam } from "@/lib/auth/guards";
import { fmtDuration } from "@/lib/format";
import { getCareOverview } from "@/lib/services/care-dashboard";
import { followUpKindLabel } from "@/lib/services/followups";

export default async function CareOverviewPage() {
  const actor = await requireCareTeam();
  const o = await getCareOverview(actor);
  const q = o.alertQueueSummary;
  const urgentCount = q.byCategory.URGENT;

  return (
    <>
      <PageHeader title="Care overview" description="Alerts waiting for a person, your cases and what is due today." />

      {urgentCount > 0 ? (
        <Notice
          tone="danger"
          role="alert"
          title={urgentCount === 1 ? "1 urgent alert is open" : `${urgentCount} urgent alerts are open`}
          className="mb-6"
          action={
            <ButtonLink href="/counsellor/alerts?category=URGENT" variant="danger">
              Review urgent alerts
            </ButtonLink>
          }
        >
          Follow the crisis protocol and record every contact attempt on the alert.
        </Notice>
      ) : null}

      <section aria-labelledby="queue-heading" className="mb-8">
        <h2 id="queue-heading" className="sr-only">
          Alert queue
        </h2>
        <StatGrid>
          <Stat label="Open alerts" value={q.open} />
          <Stat label="Urgent" value={q.byCategory.URGENT} tone={q.byCategory.URGENT ? "urgent" : "default"} />
          <Stat label="Waiting for acknowledgement" value={q.awaitingAcknowledgement} />
          <Stat label="Past response time" value={q.overdue} tone={q.overdue ? "priority" : "default"} />
          <Stat label="Assigned to me" value={q.assignedToMe} />
          <Stat label="Priority" value={q.byCategory.PRIORITY} />
          <Stat label="Cases closed, last 30 days" value={o.closedLast30Days} />
          <Stat
            label="Median time to acknowledge"
            value={o.medianMinutesToAcknowledge === null ? "-" : fmtDuration(o.medianMinutesToAcknowledge * 60_000)}
            hint="Alerts raised in the last 30 days"
          />
        </StatGrid>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Alerts needing attention"
          description="Highest category and oldest first."
          actions={
            <Link href="/counsellor/alerts" className={linkClass}>
              All alerts
            </Link>
          }
        >
          {o.topAlerts.length === 0 ? (
            <p className="text-sm text-ink-3">No open alerts. This does not mean every student is safe.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.topAlerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 py-3">
                  <TriageBadge category={a.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/counsellor/alerts/${a.id}`} className={linkClass}>
                      {a.title}
                    </Link>
                    <p className="text-sm text-ink-3">
                      {a.student.name}, raised <When date={a.createdAt} />
                    </p>
                  </div>
                  {a.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Follow-ups due" description="Overdue and due today, assigned to you.">
          {o.followUpsOverdue.length + o.followUpsDueToday.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing due today.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...o.followUpsOverdue, ...o.followUpsDueToday].map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    {f.caseId ? (
                      <Link href={`/counsellor/cases/${f.caseId}`} className={linkClass}>
                        {followUpKindLabel(f.kind)}: {f.studentName}
                      </Link>
                    ) : (
                      <p className="font-medium">
                        {followUpKindLabel(f.kind)}: {f.studentName}
                      </p>
                    )}
                    <p className="text-sm text-ink-3">
                      Due <When date={f.dueAt} />
                    </p>
                  </div>
                  {f.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : <StatusPill tone="info">Today</StatusPill>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="My open cases"
          actions={
            <Link href="/counsellor/cases" className={linkClass}>
              All cases
            </Link>
          }
        >
          {o.myCases.length === 0 ? (
            <EmptyState title="No cases assigned to you">Cases appear here when you are assigned.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {o.myCases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                  <TriageBadge category={c.priority} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/counsellor/cases/${c.id}`} className={linkClass}>
                      {c.student.name}
                    </Link>
                    <p className="text-sm text-ink-3">
                      <Ref>{c.reference}</Ref> {CASE_STATUS_LABEL[c.status]}, updated <When date={c.updatedAt} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming appointments" description="For students on your cases.">
          {o.upcomingAppointments.length === 0 ? (
            <p className="text-sm text-ink-3">No upcoming appointments.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.upcomingAppointments.map((a) => (
                <li key={a.id} className="py-3">
                  {a.caseId ? (
                    <Link href={`/counsellor/cases/${a.caseId}`} className={linkClass}>
                      {a.studentName}
                    </Link>
                  ) : (
                    <p className="font-medium">{a.studentName}</p>
                  )}
                  <p className="text-sm text-ink-3">
                    <When date={a.startsAt} /> with {a.professionalName}, {a.mode === "VIDEO" ? "video" : "in person"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recently updated cases" className="lg:col-span-2">
          {o.recentCases.length === 0 ? (
            <p className="text-sm text-ink-3">No open cases.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.recentCases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                  <TriageBadge category={c.priority} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/counsellor/cases/${c.id}`} className={linkClass}>
                      {c.student.name}
                    </Link>
                    <p className="text-sm text-ink-3">
                      <Ref>{c.reference}</Ref> {CASE_STATUS_LABEL[c.status]}, updated <When date={c.updatedAt} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
