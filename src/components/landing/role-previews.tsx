"use client";

import { useState } from "react";
import { Button, Fieldset, Notice, StatusPill, Table, Td, Th, TriageBadge } from "@/components/ui";
import { cx } from "@/components/ui/classes";
import { BarList, Sparkline } from "@/components/charts";
import { DEPARTMENT_SAMPLE, QUEUE_ALERTS, SAMPLE_MIN_COHORT } from "@/components/landing/sample";
import { NATIONAL_CRISIS_CONTACTS } from "@/lib/services/config";
import { suppressCells } from "@/lib/privacy/suppression";
import { DEFAULT_RULES, RULE_LABELS } from "@/lib/risk/rules";
import { CATEGORY_LEAD } from "@/lib/risk/engine";

function SampleTag() {
  return <StatusPill tone="info">Sample data</StatusPill>;
}

function PreviewFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="text-sm font-semibold">{title}</p>
        <SampleTag />
      </div>
      <div className="grid gap-4 px-5 py-4">{children}</div>
    </div>
  );
}

// ---------- Student ----------

export function StudentPreview() {
  const [share, setShare] = useState(true);
  return (
    <PreviewFrame title="Student: my check-in trends">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">Mood over five weeks (1 to 5)</p>
          <p className="mt-1 text-sm text-ink-2">Only you can always see this chart.</p>
        </div>
        <Sparkline values={[3, 3, 2, 3, 4]} min={1} max={5} label="Mood over five weeks: 3, 3, 2, 3, 4" className="h-10 w-28" />
      </div>
      <Fieldset legend="Let my care team see my check-in trends">
        {[
          { value: true, label: "Yes, share my trends with the care team" },
          { value: false, label: "No, keep my trends private" },
        ].map((option) => (
          <label key={String(option.value)} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
            <input type="radio" name="preview-consent" checked={share === option.value} onChange={() => setShare(option.value)} className="size-4 accent-[var(--accent)]" />
            {option.label}
          </label>
        ))}
      </Fieldset>
      <div role="status" aria-live="polite">
        <Notice tone={share ? "info" : "success"} title={share ? "Your counsellor can see your trends" : "Your trends stay private"}>
          {share
            ? "You can change this at any time. Nothing is watched live."
            : "Check-in trends are hidden from the care team. If you ask for help, the team sees that request because you asked."}
        </Notice>
      </div>
    </PreviewFrame>
  );
}

// ---------- Counsellor ----------

export function CounsellorPreview() {
  const [selected, setSelected] = useState<string>(QUEUE_ALERTS[0].id);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const current = QUEUE_ALERTS.find((a) => a.id === selected) ?? QUEUE_ALERTS[0];
  const done = acknowledged[current.id] === true;

  return (
    <PreviewFrame title="Counsellor: alert queue">
      <Table caption="Sample alert queue, invented students">
        <thead>
          <tr>
            <Th>Triage</Th>
            <Th>Alert</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {QUEUE_ALERTS.map((alert) => (
            <tr key={alert.id} className={cx(alert.id === selected && "bg-surface-2")}>
              <Td>
                <TriageBadge category={alert.evaluation.category} size="sm" />
              </Td>
              <Td>
                <button
                  type="button"
                  onClick={() => setSelected(alert.id)}
                  aria-pressed={alert.id === selected}
                  className="text-left font-medium text-accent-text underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {alert.evaluation.title}
                </button>
                <p className="mt-0.5 font-mono text-xs text-ink-3">{alert.reference}</p>
              </Td>
              <Td>{acknowledged[alert.id] ? <StatusPill tone="accent">Acknowledged</StatusPill> : <StatusPill>Waiting for review</StatusPill>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="grid gap-3 rounded-control border border-line px-4 py-3">
        <p className="text-sm font-semibold">
          {CATEGORY_LEAD[current.evaluation.category]}: what the rules saw
        </p>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-ink-2">
          {current.evaluation.findings.map((f) => (
            <li key={f.dedupeKey}>
              <span className="font-medium text-ink">{RULE_LABELS[f.ruleCode] ?? f.ruleCode}.</span> {f.explanation}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-2">Suggested action: {current.evaluation.action}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={done}
            onClick={() => setAcknowledged((prev) => ({ ...prev, [current.id]: true }))}
          >
            {done ? "Acknowledged in this simulation" : "Acknowledge this alert"}
          </Button>
          <p className="text-sm text-ink-3">Only a person can acknowledge or close an alert. This saves nothing.</p>
        </div>
      </div>
    </PreviewFrame>
  );
}

// ---------- Clinician ----------

export function ClinicianPreview() {
  const sh = DEFAULT_RULES.sustainedHigh;
  const pl = DEFAULT_RULES.persistentLow;
  const sr = DEFAULT_RULES.scoreRise;
  const safety = DEFAULT_RULES.phq9SafetyItem;
  const rows = [
    { code: "SUSTAINED_HIGH_STRESS", when: `Stress ${sh.threshold} or higher in ${sh.consecutive} check-ins within ${sh.withinDays} days`, category: sh.category },
    { code: "PERSISTENT_LOW_MOOD", when: `Mood ${pl.threshold} or lower in ${pl.count} of the last ${pl.ofLast} check-ins`, category: pl.category },
    { code: "PHQ9_SCORE_RISE", when: `PHQ-9 up ${sr.phq9Points} points or more within ${sr.comparisonDays} days`, category: sr.category },
    { code: "PHQ9_SAFETY_ITEM", when: `Question 9 above "Not at all" within ${safety.withinDays} days`, category: safety.category },
  ] as const;

  return (
    <PreviewFrame title="Clinician: written triage rules">
      <Table caption={`Sample of the default triage rules, version ${DEFAULT_RULES.version}`}>
        <thead>
          <tr>
            <Th>Rule</Th>
            <Th>Fires when</Th>
            <Th>Triage</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <Td className="font-medium">{RULE_LABELS[row.code]}</Td>
              <Td className="text-ink-2">{row.when}</Td>
              <Td>
                <TriageBadge category={row.category} size="sm" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-sm text-ink-2">Thresholds can be tuned by clinicians. Safety rules can be tuned but never switched off. Clinical notes stay private to the clinicians involved.</p>
      <Notice tone="info" title="If someone may be in danger now">
        <p>
          {NATIONAL_CRISIS_CONTACTS.map((c, i) => (
            <span key={c.phone}>
              {i > 0 ? ". " : ""}
              {c.label.split(" (")[0]}: <strong className="font-mono">{c.phone}</strong>
            </span>
          ))}
          .
        </p>
      </Notice>
    </PreviewFrame>
  );
}

// ---------- Administrator ----------

export function AdminPreview() {
  const cells = suppressCells(DEPARTMENT_SAMPLE, SAMPLE_MIN_COHORT);
  const hidden = cells.filter((c) => c.suppressed);
  return (
    <PreviewFrame title="Administrator: anonymous totals">
      <div>
        <p className="text-sm font-medium text-ink">Students who completed a check-in this month, by department</p>
        <p className="mt-1 text-sm text-ink-3">Aggregate figures only. No individual student is visible here.</p>
      </div>
      <BarList
        max={100}
        format={(v) => `${v}%`}
        suppressedText="Hidden"
        items={cells.map((c) => ({
          key: c.key,
          label: c.key,
          value: c.value,
          note: c.suppressed ? "Hidden because this group has fewer than 10 students, to make it harder to identify anyone." : `${c.n} students`,
        }))}
      />
      <Notice tone="info" title={hidden.length === 1 ? "One group is hidden" : `${hidden.length} groups are hidden`}>
        This sample uses a minimum group size of {SAMPLE_MIN_COHORT}. Each institution sets its own, and it is never below 5.
      </Notice>
    </PreviewFrame>
  );
}
