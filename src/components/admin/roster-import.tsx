"use client";

import { useActionState, useId, useState, type ChangeEvent } from "react";
import readXlsxFile from "read-excel-file/browser";
import { inputClass, buttonClass } from "@/components/ui/classes";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImportResults } from "@/components/admin/roster-import-results";
import type { RosterImportAction, RosterImportActionState } from "@/components/admin/roster-import-state";
import { MAX_FILE_BYTES, MAX_ROWS, normalizeRosterMatrix, parseCsvMatrix, type RosterRow } from "@/components/admin/roster-import-parser";

const IDLE: RosterImportActionState = { status: "idle" };

function ImportProgress({ activeStep, finished }: { activeStep: 1 | 2 | 3; finished: boolean }) {
  const steps = ["Choose file", "Review sample", "Create accounts"] as const;
  return (
    <ol aria-label="Spreadsheet import steps" className="grid gap-2 sm:grid-cols-3">
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const complete = finished || step < activeStep;
        const current = !finished && step === activeStep;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={`flex min-w-0 items-center gap-3 rounded-control border px-3 py-3 ${current ? "border-accent bg-accent-soft" : complete ? "border-accent/40 bg-surface" : "border-line bg-surface"}`}
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-sm font-semibold tabular-nums ${complete || current ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3"}`}>
              {complete ? "✓" : String(step).padStart(2, "0")}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className={`truncate text-sm ${current ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>{label}</span>
              <span className="text-xs text-ink-3">{complete ? "Complete" : current ? "In progress" : "Up next"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ColumnGuide({ label, fields, note }: { label: string; fields: string[]; note?: string }) {
  return (
    <div className="grid gap-2 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm font-semibold text-ink">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <code key={field} className="rounded-control border border-line bg-surface px-2 py-1 font-mono text-xs text-ink-2">{field}</code>
        ))}
      </dd>
      {note ? <p className="text-xs leading-relaxed text-ink-3">{note}</p> : null}
    </div>
  );
}

export function RosterImportForm({ action }: { action: RosterImportAction }) {
  const id = useId();
  const [state, formAction, isPending] = useActionState<RosterImportActionState, FormData>(action, IDLE);
  const [parsed, setParsed] = useState<{ rows: RosterRow[]; batch: string; fileName: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const currentResult = parsed && state.batch === parsed.batch ? state : null;
  const activeStep: 1 | 2 | 3 = isPending || currentResult?.status === "ok" ? 3 : parsed ? 2 : 1;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setParsed(null);
    setParseError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setParseError("Choose a file smaller than 5 MB.");
      return;
    }

    setReading(true);
    try {
      const extension = file.name.toLowerCase().split(".").pop();
      let matrix: unknown[][];
      if (extension === "csv") {
        matrix = parseCsvMatrix(await file.text());
      } else if (extension === "xlsx") {
        const sheets = await readXlsxFile(file);
        matrix = sheets[0]?.data ?? [];
      } else {
        throw new Error("Choose an .xlsx or .csv file.");
      }
      const rows = normalizeRosterMatrix(matrix);
      if (new TextEncoder().encode(JSON.stringify(rows)).length > 400_000) {
        throw new Error("This roster is too large to submit. Split it into smaller files and try again.");
      }
      setParsed({ rows, batch: crypto.randomUUID(), fileName: file.name });
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not read this spreadsheet. Check the file and try again.");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <ImportProgress activeStep={activeStep} finished={currentResult?.status === "ok"} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section className="grid content-start gap-4" aria-labelledby={`${id}-upload-title`}>
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">Step 1 · File upload</p>
            <h3 id={`${id}-upload-title`} className="mt-1 text-lg font-semibold tracking-tight">Choose a roster file</h3>
            <p className="mt-1 text-sm text-ink-3">CampusCare reads the first worksheet and previews rows before any accounts are created.</p>
          </header>

          <div className="grid gap-3 rounded-panel border-2 border-dashed border-line-input bg-surface-2 p-4 sm:p-5">
            <label htmlFor={`${id}-file`} className="text-sm font-semibold text-ink">Excel workbook or CSV file</label>
            <input
              id={`${id}-file`}
              type="file"
              disabled={reading}
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={handleFile}
              className="block w-full cursor-pointer rounded-control border border-line-input bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-accent file:px-3 file:py-2 file:font-semibold file:text-accent-ink hover:file:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60"
              aria-describedby={`${id}-file-help`}
            />
            <p id={`${id}-file-help`} className="text-sm leading-relaxed text-ink-2">Supported formats: <strong>.xlsx</strong> and <strong>.csv</strong>. Files are parsed in this browser; only normalized rows are sent to CampusCare.</p>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <a href="/templates/campuscare-roster-template.csv" download className={buttonClass("secondary", "sm")}>
                Download CSV template
              </a>
              <span className="text-xs text-ink-3">5 MB · up to {MAX_ROWS} rows</span>
            </div>
          </div>
        </section>

        <aside className="grid content-start gap-3 rounded-panel bg-surface-2 p-4 sm:p-5" aria-labelledby={`${id}-guide-title`}>
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">Spreadsheet guide</p>
            <h3 id={`${id}-guide-title`} className="mt-1 text-lg font-semibold tracking-tight">Use these column names</h3>
            <p className="mt-1 text-sm text-ink-3">Unknown columns are ignored. Column order does not matter.</p>
          </header>
          <dl className="divide-y divide-line border-y border-line">
            <ColumnGuide label="Every row" fields={["name", "email", "role"]} note="Role must be STUDENT, COUNSELLOR or CLINICIAN." />
            <ColumnGuide label="Student rows" fields={["departmentCode", "studentNumber", "academicYear"]} note="Student email must match the institution domain; department codes must already exist." />
            <ColumnGuide label="Counsellor / clinician rows" fields={["qualifications", "profession"]} note="Professional details are optional. Profession may be COUNSELLOR, COUNSELLING_PSYCHOLOGIST, CLINICAL_PSYCHOLOGIST or PSYCHIATRIST." />
            <ColumnGuide label="Optional details" fields={["locale", "contactPhone", "languages", "specialisations"]} note="Locale defaults to en. Separate languages and specialisations with commas or semicolons." />
          </dl>
          <div className="flex items-start gap-3 rounded-control border border-line bg-surface px-3 py-3">
            <span className="shrink-0 rounded-control bg-accent-soft px-2 py-1 font-mono text-xs font-semibold text-accent-text">72h</span>
            <p className="text-xs leading-relaxed text-ink-3">Created accounts receive one-time password setup links. Links appear after import; CampusCare does not email them automatically.</p>
          </div>
        </aside>
      </div>

      {reading ? (
        <div role="status" aria-busy="true" className="grid gap-2 rounded-control border border-line bg-surface-2 p-4">
          <p className="text-sm font-medium">Reading spreadsheet in this browser…</p>
          <span className="h-2 w-2/3 animate-pulse rounded-full bg-line" />
          <span className="h-2 w-1/2 animate-pulse rounded-full bg-line" />
        </div>
      ) : null}
      {parseError ? <p role="alert" className="rounded-control bg-urgent-soft px-3 py-2 text-sm font-medium text-urgent-text">{parseError}</p> : null}

      {parsed ? (
        <section className="grid gap-3 border-t border-line pt-5" aria-live="polite" aria-labelledby={`${id}-preview-title`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">Step 2 · Review</p>
              <h3 id={`${id}-preview-title`} className="mt-1 text-base font-semibold">{parsed.fileName}</h3>
              <p className="mt-1 text-sm text-ink-2">{parsed.rows.length} data {parsed.rows.length === 1 ? "row" : "rows"} parsed. Check the sample before continuing.</p>
            </div>
            <span className="w-fit rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-3">First worksheet · blank rows ignored</span>
          </div>
          <div className="overflow-x-auto rounded-panel border border-line">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="caption-bottom bg-surface px-3 py-2 text-left text-xs text-ink-3">Sample preview: first five non-empty rows. Every row is checked again on the server.</caption>
              <thead className="bg-surface-2 text-xs text-ink-3"><tr><th scope="col" className="px-3 py-2.5">Sheet row</th><th scope="col" className="px-3 py-2.5">Name</th><th scope="col" className="px-3 py-2.5">Email</th><th scope="col" className="px-3 py-2.5">Role</th></tr></thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((row) => (
                  <tr key={row.__rowNumber} className="border-t border-line"><td className="px-3 py-2.5 font-mono tabular-nums text-ink-3">{row.__rowNumber}</td><td className="px-3 py-2.5 font-medium">{row.name}</td><td className="px-3 py-2.5 text-ink-2">{row.email}</td><td className="px-3 py-2.5">{row.role}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <ActionMessage state={currentResult?.status === "error" ? currentResult : IDLE} />
      {currentResult ? <ImportResults state={currentResult} /> : null}

      {parsed && currentResult?.status !== "ok" ? (
        <form action={formAction} className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <input type="hidden" name="rows" value={JSON.stringify(parsed.rows)} />
          <input type="hidden" name="batch" value={parsed.batch} />
          <p className="max-w-[58ch] text-sm text-ink-3">Creating accounts is immediate. Check the sample above before you continue.</p>
          <SubmitButton pendingLabel="Creating accounts">Create {parsed.rows.length} account{parsed.rows.length === 1 ? "" : "s"}</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
