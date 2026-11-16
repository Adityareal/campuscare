import type { TriageCategory } from "@/generated/prisma/enums";
import { AlertTable } from "@/components/care/alert-table";
import { QueryTabs } from "@/components/care/tabs";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { cx } from "@/components/ui/classes";
import Link from "next/link";
import { requireCareTeam } from "@/lib/auth/guards";
import { listAlerts, type AlertView } from "@/lib/services/alerts";

const VIEWS: { key: AlertView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Assigned to me" },
  { key: "unassigned", label: "Unassigned" },
  { key: "closed", label: "Closed" },
];

const CATEGORIES: { key: TriageCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "All categories" },
  { key: "URGENT", label: "Urgent" },
  { key: "PRIORITY", label: "Priority" },
  { key: "MONITOR", label: "Monitor" },
];

function hrefFor(view: string, category: string): string {
  const params = new URLSearchParams();
  if (view !== "open") params.set("view", view);
  if (category !== "ALL") params.set("category", category);
  const qs = params.toString();
  return qs ? `/counsellor/alerts?${qs}` : "/counsellor/alerts";
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ view?: string; category?: string }> }) {
  const actor = await requireCareTeam();
  const sp = await searchParams;
  const view: AlertView = VIEWS.find((v) => v.key === sp.view)?.key ?? "open";
  const categoryKey = CATEGORIES.find((c) => c.key === sp.category)?.key ?? "ALL";
  const rows = await listAlerts(actor, { view, ...(categoryKey !== "ALL" ? { category: categoryKey } : {}) });
  const viewLabel = VIEWS.find((v) => v.key === view)?.label ?? "Open";

  return (
    <>
      <PageHeader title="Alerts" description="Flags raised by the written triage rules, waiting for a person to review." />
      <Notice className="mb-5">
        Categories are operational labels for how soon to respond, not diagnoses. No alert does not mean a student is safe.
      </Notice>

      <QueryTabs label="Alert views" current={view} tabs={VIEWS.map((v) => ({ key: v.key, label: v.label, href: hrefFor(v.key, categoryKey) }))} />

      <nav aria-label="Filter by category" className="mb-5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = c.key === categoryKey;
          return (
            <Link
              key={c.key}
              href={hrefFor(view, c.key)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "inline-flex h-9 items-center rounded-full border px-3 text-sm",
                active ? "border-accent bg-accent-soft font-medium text-accent-text" : "border-line text-ink-2 hover:bg-surface-2",
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title="No alerts in this view">
          {view === "closed" ? "Closed alerts appear here." : "No alert is waiting here right now. This does not mean every student is safe."}
        </EmptyState>
      ) : (
        <AlertTable rows={rows} caption={`${viewLabel} alerts, ${rows.length} shown`} />
      )}
    </>
  );
}
