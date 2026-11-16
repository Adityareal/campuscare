import type { Metadata } from "next";
import { RowActionForm } from "@/components/admin/forms";
import { ButtonLink, EmptyState, PageHeader, Panel, Table, Td, Th, When, buttonClass, cx, inputClass } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { listAuditLog } from "@/lib/services/admin";
import { verifyChainAction } from "./actions";

export const metadata: Metadata = { title: "Audit log" };

const ACTION_FILTERS = [
  { value: "", label: "All actions" },
  { value: "auth.", label: "Sign-in and security" },
  { value: "user.", label: "Accounts" },
  { value: "invite.", label: "Invite codes" },
  { value: "institution.", label: "Institution settings" },
  { value: "department.", label: "Departments" },
  { value: "report.", label: "Reports" },
  { value: "consent.", label: "Consent changes" },
  { value: "alert.", label: "Alerts" },
  { value: "case.", label: "Cases" },
  { value: "clinical_note.", label: "Clinical note access" },
  { value: "audit.", label: "Audit checks" },
];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function fmtMetadata(meta: Record<string, string | number | boolean | null> | null): string {
  if (!meta) return "-";
  const parts = Object.entries(meta).map(([k, v]) => `${k}: ${v === null ? "none" : String(v)}`);
  return parts.length ? parts.join(", ") : "-";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireInstitutionAdmin();
  const sp = await searchParams;
  const action = first(sp.action) ?? "";
  const beforeRaw = Number(first(sp.before));
  const before = Number.isInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;
  const { entries, nextBefore } = await listAuditLog(actor, { before, action: action || null });

  const nextHref = nextBefore ? `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), before: String(nextBefore) }).toString()}` : null;
  const firstHref = `/admin/audit${action ? `?${new URLSearchParams({ action }).toString()}` : ""}`;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change and every access to sensitive records, newest first. Entries hold ids and codes only, never what anyone wrote."
      />

      <div className="grid gap-6">
        <Panel
          title="Chain verification"
          description="Each entry is linked to the one before it by a hash. Verification recalculates every link to detect entries changed outside CampusCare."
        >
          <RowActionForm action={verifyChainAction} fields={{}} label="Verify the audit log" pendingLabel="Verifying" variant="primary" />
        </Panel>

        <form method="get" action="/admin/audit" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid gap-2 sm:w-80">
            <label htmlFor="audit-action" className="text-sm font-medium">
              Show
            </label>
            <select id="audit-action" name="action" defaultValue={action} className={cx(inputClass, "pr-8")}>
              {ACTION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
        </form>

        {entries.length ? (
          <Table caption="Audit log entries, newest first">
            <thead>
              <tr>
                <Th>No.</Th>
                <Th>Time</Th>
                <Th>Actor role</Th>
                <Th>Action</Th>
                <Th>Entity type</Th>
                <Th>Entity id</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.seq}>
                  <Td className="font-mono tabular-nums text-ink-3">{e.seq}</Td>
                  <Td>
                    <When date={e.createdAt} />
                  </Td>
                  <Td className="font-mono text-xs">{e.actorRole ?? "-"}</Td>
                  <Td className="font-mono text-xs">{e.action}</Td>
                  <Td className="font-mono text-xs">{e.entityType}</Td>
                  <Td className="max-w-[12rem] break-all font-mono text-xs text-ink-2">{e.entityId ?? "-"}</Td>
                  <Td className="max-w-[18rem] break-words font-mono text-xs text-ink-2">{fmtMetadata(e.metadata)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No entries">Nothing matches this filter.</EmptyState>
        )}

        <div className="flex flex-wrap gap-2">
          {before ? (
            <ButtonLink href={firstHref} variant="secondary">
              Newest entries
            </ButtonLink>
          ) : null}
          {nextHref ? (
            <ButtonLink href={nextHref} variant="secondary">
              Older entries
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </>
  );
}
