import Link from "next/link";
import { CASE_SOURCE_LABEL, CASE_STATUS_LABEL, DEPARTMENT_NONE } from "@/components/care/labels";
import { QueryTabs } from "@/components/care/tabs";
import { EmptyState, PageHeader, Ref, StatusPill, Table, Td, Th, TriageBadge, When, linkClass } from "@/components/ui";
import { requireCareTeam } from "@/lib/auth/guards";
import { listCases } from "@/lib/services/cases";

const TABS = [
  { key: "mine", label: "My cases" },
  { key: "open", label: "All open" },
  { key: "closed", label: "Closed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireCareTeam();
  const sp = await searchParams;
  const view: TabKey = TABS.find((t) => t.key === sp.view)?.key ?? "mine";
  const rows = await listCases(actor, view === "closed" ? { status: "CLOSED" } : { status: "OPEN_ANY", mine: view === "mine" });
  const tabLabel = TABS.find((t) => t.key === view)?.label ?? "Cases";

  return (
    <>
      <PageHeader title="Cases" description="Each case follows one student's support from first contact to outcome." />
      <QueryTabs
        label="Case views"
        current={view}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "mine" ? "/counsellor/cases" : `/counsellor/cases?view=${t.key}` }))}
      />
      {rows.length === 0 ? (
        <EmptyState title="No cases in this view">
          {view === "mine" ? "Cases assigned to you appear here." : view === "closed" ? "Closed cases appear here." : "Open cases appear here."}
        </EmptyState>
      ) : (
        <Table caption={`${tabLabel}, ${rows.length} shown`}>
          <thead>
            <tr>
              <Th>Priority</Th>
              <Th>Student</Th>
              <Th>Case</Th>
              <Th>Status</Th>
              <Th>Next follow-up</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const next = c.followUps[0];
              return (
                <tr key={c.id}>
                  <Td>
                    <TriageBadge category={c.priority} size="sm" />
                  </Td>
                  <Td>
                    <Link href={`/counsellor/cases/${c.id}`} className={linkClass}>
                      {c.student.name}
                    </Link>
                    <p className="text-ink-3">{c.student.student?.department.name ?? DEPARTMENT_NONE}</p>
                  </Td>
                  <Td>
                    <Ref>{c.reference}</Ref>
                    <p className="text-ink-3">{CASE_SOURCE_LABEL[c.source]}</p>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{CASE_STATUS_LABEL[c.status]}</span>
                      {c.assignments.length === 0 && c.status !== "CLOSED" ? <StatusPill tone="warning">Unassigned</StatusPill> : null}
                      {c.missedConcern ? <StatusPill tone="info">Missed-concern review</StatusPill> : null}
                    </div>
                  </Td>
                  <Td>{next ? <When date={next.dueAt} /> : <span className="text-ink-3">None</span>}</Td>
                  <Td>
                    <When date={c.updatedAt} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
