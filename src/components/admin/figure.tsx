import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/classes";
import { PERIOD_LABELS, PERIODS, hiddenText, fmtCount, type Figure, type PeriodKey } from "@/lib/services/analytics";

/** A released number, or the reason it is withheld. Never shows a hidden value. */
export function FigureText({ figure, k, format = fmtCount }: { figure: Figure; k: number; format?: (v: number) => string }) {
  if (figure.value !== null) return <>{format(figure.value)}</>;
  return (
    <span className="block font-sans text-sm font-normal leading-snug tracking-normal text-ink-3">{hiddenText(figure.hidden ?? "small_group", k)}</span>
  );
}

/** Explains small-group suppression in one place on each page. */
export function SuppressionNote({ k, children }: { k: number; children?: ReactNode }) {
  return (
    <p className="max-w-[70ch] text-sm text-ink-3">
      Figures that describe fewer than {k} students are hidden so no one can be identified. When a table shows a total and only
      one group is hidden, the next smallest group is hidden as well so the first cannot be worked out by subtraction.
      {children ? <> {children}</> : null}
    </p>
  );
}

/** Period switcher rendered as links, so it works without client JavaScript. */
export function PeriodTabs({ current, basePath, extra = {} }: { current: PeriodKey; basePath: string; extra?: Record<string, string> }) {
  const keys = Object.keys(PERIODS) as PeriodKey[];
  return (
    <nav aria-label="Reporting period" className="flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1">
      {keys.map((key) => {
        const params = new URLSearchParams({ ...extra, period: key });
        const active = key === current;
        return (
          <Link
            key={key}
            href={`${basePath}?${params.toString()}`}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex h-9 items-center rounded-control px-3 text-sm",
              active ? "bg-accent-soft font-medium text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {PERIOD_LABELS[key]}
          </Link>
        );
      })}
    </nav>
  );
}

/** Two or more mutually exclusive views of one page, rendered as links. */
export function LinkTabs({ label, items }: { label: string; items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 border-b border-line">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cx(
            "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm",
            item.active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
