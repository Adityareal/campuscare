"use client";

import { useId, type ReactNode } from "react";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/ui";
import { cx } from "@/components/ui/classes";
import { CRISIS_CONTACTS } from "@/lib/demo-flow/content";

/** Visible label, one-line description and an on or off switch. The state is also written as text. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  note,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  note?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6">
      <div className="min-w-0">
        <p id={`${id}-label`} className="font-medium">
          {label}
        </p>
        <p id={`${id}-desc`} className="mt-1 max-w-[62ch] text-sm text-ink-2">
          {description}
        </p>
        {note ? <div className="mt-2 text-sm text-ink-3">{note}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="group inline-flex h-11 shrink-0 items-center gap-3 justify-self-start rounded-control pr-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-end"
      >
        <span
          aria-hidden
          className={cx(
            "relative inline-block h-7 w-12 rounded-full border transition-colors duration-150",
            checked ? "border-accent bg-accent" : "border-line-input bg-surface-2",
          )}
        >
          <span
            className={cx(
              "absolute left-0.5 top-0.5 size-5 rounded-full transition-transform duration-150",
              checked ? "translate-x-5 bg-accent-ink" : "translate-x-0 bg-ink-3",
            )}
          />
        </span>
        <span className="w-7 text-left tabular-nums">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

export type ChoiceOption = { value: number; label: string };

/** A labelled radio group drawn as chips. Native radios keep arrow keys, grouping and labels. */
export function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
  skipLabel = "Skip",
  disabled,
  hint,
}: {
  legend: ReactNode;
  options: readonly ChoiceOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  skipLabel?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const name = useId();
  const all: { value: number | null; label: string }[] = [{ value: null, label: skipLabel }, ...options];
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-1 max-w-[62ch] text-sm font-medium text-ink">{legend}</legend>
      {hint ? <p className="-mt-1 text-sm text-ink-3">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {all.map((o) => {
          const selected = value === o.value;
          return (
            <label key={String(o.value)} className="relative">
              <input
                type="radio"
                name={name}
                className="peer sr-only"
                checked={selected}
                onChange={() => onChange(o.value)}
                disabled={disabled}
              />
              <span
                className={cx(
                  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-sm transition-colors duration-150",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                  selected
                    ? "border-accent bg-accent-soft font-medium text-accent-text"
                    : "border-line-input bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {selected ? <CheckIcon size={14} weight="bold" aria-hidden /> : null}
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The national crisis numbers. Rendered wherever a simulated urgent case appears. */
export function CrisisContacts({ title = "If you are in danger now" }: { title?: string }) {
  return (
    <Notice tone="danger" title={title}>
      <ul className="mt-1 grid gap-1">
        {CRISIS_CONTACTS.map((c) => (
          <li key={c.phone}>
            {c.label}:{" "}
            <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="font-semibold underline underline-offset-4">
              {c.phone}
            </a>{" "}
            ({c.hours})
          </li>
        ))}
      </ul>
    </Notice>
  );
}

export function SimulationTag() {
  return (
    <span className="inline-flex items-center rounded-full bg-monitor-soft px-2.5 py-0.5 text-xs font-medium text-monitor-text">
      Simulation, sample data
    </span>
  );
}

export function ErrorLine({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-sm font-medium text-urgent-text">
      {children}
    </p>
  );
}
