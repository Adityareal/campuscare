import Link from "next/link";
import { FollowUpCompleteForm } from "@/components/care/follow-up-complete-form";
import { QueryTabs } from "@/components/care/tabs";
import { EmptyState, PageHeader, Ref, StatusPill, When, linkClass } from "@/components/ui";
import { requireCareTeam } from "@/lib/auth/guards";
import { followUpKindLabel, listFollowUps, type FollowUpView } from "@/lib/services/followups";
import { completeFollowUpAction } from "./actions";

const TABS: { key: FollowUpView; label: string }[] = [
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All scheduled" },
];

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireCareTeam();
  const sp = await searchParams;
  const view: FollowUpView = TABS.find((t) => t.key === sp.view)?.key ?? "mine";
  const rows = await listFollowUps(actor, { view });

  return (
    <>
      <PageHeader title="Follow-ups" description="Scheduled check-ins and reviews, soonest first." />
      <QueryTabs
        label="Follow-up views"
        current={view}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "mine" ? "/counsellor/follow-ups" : `/counsellor/follow-ups?view=${t.key}` }))}
      />
      {rows.length === 0 ? (
        <EmptyState title="No follow-ups in this view">Follow-ups scheduled on cases appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((f) => (
            <li key={f.id} className="grid gap-3 py-5 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {followUpKindLabel(f.kind)}: {f.studentName}
                  </p>
                  <p className="text-sm text-ink-3">
                    Due <When date={f.dueAt} />, assigned to {f.assignedToName}
                    {f.caseId ? (
                      <>
                        {". "}
                        <Link href={`/counsellor/cases/${f.caseId}`} className={linkClass}>
                          Case {f.caseReference ? <Ref>{f.caseReference}</Ref> : null}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {f.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : <StatusPill tone="info">Scheduled</StatusPill>}
              </div>
              <FollowUpCompleteForm action={completeFollowUpAction} followUpId={f.id} caseId={f.caseId} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
