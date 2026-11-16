import type { Metadata } from "next";
import { orNotFound } from "@/components/admin/not-found";
import { PrintButton } from "@/components/admin/print-button";
import { ButtonLink, Notice, PageHeader, Panel, Table, Td, Th, buttonClass, inputClass, cx } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { now } from "@/lib/clock";
import { fmtDate, fmtDateTime, isoDay } from "@/lib/format";
import { REPORT_KINDS, REPORT_KIND_INFO, buildReport, isReportKind, parsePeriodEnd } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Reports" };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireInstitutionAdmin();
  const sp = await searchParams;
  const kindParam = first(sp.kind) ?? "";
  const endParam = first(sp.periodEnd);
  const today = isoDay(now());
  const selectedKind = isReportKind(kindParam) ? kindParam : "MONTHLY";
  const selectedEnd = endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : today;

  const report = isReportKind(kindParam) ? await orNotFound(buildReport(actor, { kind: kindParam, periodEnd: parsePeriodEnd(selectedEnd) })) : null;
  const downloadHref = `/admin/reports/download?${new URLSearchParams({ kind: selectedKind, periodEnd: selectedEnd }).toString()}`;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description="Group-level reports for leadership and committees. Small groups are hidden and no report contains an individual student's information or any clinical note."
        />
      </div>

      <div className="grid gap-6">
        <Panel title="Choose a report" className="print:hidden">
          <form method="get" action="/admin/reports" className="grid gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
            <div className="grid gap-2">
              <label htmlFor="report-kind" className="text-sm font-medium">
                Report type
              </label>
              <select id="report-kind" name="kind" defaultValue={selectedKind} className={cx(inputClass, "pr-8")} aria-describedby="report-kind-hint">
                {REPORT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {REPORT_KIND_INFO[k].label}
                  </option>
                ))}
              </select>
              <p id="report-kind-hint" className="text-sm text-ink-3">
                {REPORT_KIND_INFO[selectedKind].description}
              </p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="report-end" className="text-sm font-medium">
                Period ends on
              </label>
              <input id="report-end" name="periodEnd" type="date" max={today} defaultValue={selectedEnd} className={inputClass} required />
              <p className="text-sm text-ink-3">The period runs back from this date.</p>
            </div>
            <div className="md:pb-7">
              <button type="submit" className={buttonClass("primary")}>
                Preview report
              </button>
            </div>
          </form>
        </Panel>

        {report ? (
          <article className="grid gap-6" aria-labelledby="report-title">
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
              <div>
                <p className="text-sm text-ink-3">{report.institutionName}</p>
                <h2 id="report-title" className="text-xl font-semibold tracking-tight">
                  {report.title}
                </h2>
                <p className="mt-1 text-sm text-ink-2">
                  {fmtDate(report.period.from)} to {fmtDate(report.period.to)}. Generated {fmtDateTime(report.generatedAt)}. Groups smaller
                  than {report.k} students are hidden.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <PrintButton />
                <ButtonLink href={downloadHref} variant="primary" prefetch={false}>
                  Download CSV
                </ButtonLink>
              </div>
            </header>

            {report.sections.map((s) => (
              <section key={s.title} className="grid gap-3 break-inside-avoid">
                <h3 className="text-base font-semibold">{s.title}</h3>
                {s.note ? <p className="max-w-[75ch] text-sm text-ink-3">{s.note}</p> : null}
                <Table caption={s.title}>
                  <thead>
                    <tr>
                      {s.columns.map((c) => (
                        <Th key={c}>{c}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <Td key={j} className={j === 0 ? "font-medium" : "tabular-nums"}>
                            {cell}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </section>
            ))}
          </article>
        ) : (
          <Notice tone="info" title="No report selected">
            Choose a report type and an end date, then preview it. You can print the preview or download it as a CSV file.
          </Notice>
        )}
      </div>
    </>
  );
}
