"use client";

import { useId, useState } from "react";
import { buttonClass, inputClass } from "@/components/ui/classes";
import { fmtDateTime } from "@/lib/format";
import type { RosterImportActionState } from "@/components/admin/roster-import-state";
import type { RosterImportSuccess } from "@/lib/services/roster-import";

function DownloadLinks({ rows }: { rows: RosterImportSuccess[] }) {
  function download() {
    const lines = [
      ["row", "name", "email", "role", "setup_link", "expires_at"].map(safeCsvCell).join(","),
      ...rows.map((row) =>
        [String(row.row), row.name, row.email, row.role, row.link, row.expiresAt].map(safeCsvCell).join(","),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "campuscare-setup-links.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button type="button" className={buttonClass("secondary", "sm")} onClick={download}>
      Download setup links CSV
    </button>
  );
}

function safeCsvCell(value: string): string {
  const safe = /^[\t\r\n =+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function SetupLink({ entry }: { entry: RosterImportSuccess }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.link);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <details className="max-w-xl">
      <summary className="cursor-pointer text-sm font-medium text-accent-text">Show one-time setup link</summary>
      <div className="mt-2 grid gap-2">
        <p className="text-xs text-ink-3">Works once, until {fmtDateTime(new Date(entry.expiresAt))}. Share through an official channel.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={id} className="sr-only">Setup link for {entry.name}</label>
          <input id={id} readOnly value={entry.link} className={`${inputClass} font-mono text-xs`} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={copy} className={buttonClass("secondary", "sm")}>Copy</button>
        </div>
        <p role="status" className="text-xs text-ink-3">{copied === "done" ? "Copied to the clipboard." : copied === "failed" ? "Copy did not work. Select the link and copy it by hand." : ""}</p>
      </div>
    </details>
  );
}

export function ImportResults({ state }: { state: RosterImportActionState }) {
  const created = state.created ?? [];
  const skipped = state.skipped ?? [];
  if (state.status !== "ok") return null;

  return (
    <section className="grid gap-4 border-t border-line pt-5" aria-label="Roster import results">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-sm text-ink-2">{created.length} created · {skipped.length} skipped</p>
        {created.length ? <DownloadLinks rows={created} /> : null}
      </div>
      {!state.auditSummaryRecorded ? (
        <p className="rounded-control bg-priority-soft px-3 py-2 text-sm text-priority-text">Accounts were processed, but the import summary could not be written to the audit log. Each created account still has its own audit entry.</p>
      ) : null}
      {created.length ? (
        <div className="overflow-x-auto rounded-panel border border-line">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <caption className="sr-only">Created roster accounts and their one-time setup links</caption>
            <thead className="bg-surface-2 text-xs text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2">Sheet row</th>
                <th scope="col" className="px-3 py-2">Person</th>
                <th scope="col" className="px-3 py-2">Role</th>
                <th scope="col" className="px-3 py-2">Setup link</th>
              </tr>
            </thead>
            <tbody>
              {created.map((entry) => (
                <tr key={`${entry.row}-${entry.email}`} className="border-t border-line align-top">
                  <td className="px-3 py-3 font-mono tabular-nums">{entry.row}</td>
                  <td className="px-3 py-3"><span className="font-medium">{entry.name}</span><p className="text-xs text-ink-3">{entry.email}</p></td>
                  <td className="px-3 py-3">{entry.role === "STUDENT" ? "Student" : entry.role === "COUNSELLOR" ? "Counsellor" : "Clinician"}</td>
                  <td className="px-3 py-3"><SetupLink entry={entry} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {skipped.length ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Rows to fix</h3>
          <ul className="grid divide-y divide-line border-y border-line text-sm">
            {skipped.map((item) => (
              <li key={`${item.row}-${item.message}`} className="py-2">
                <span className="font-mono">Row {item.row}:</span> {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-ink-3">Setup links are shown only in this result. Download the CSV before choosing another file, or share each link securely now. Links expire after 72 hours.</p>
    </section>
  );
}
