import type { ReactNode } from "react";
import { cx } from "@/components/ui/classes";
import { fmtDay } from "@/lib/format";

/*
 * Small, dependency-free data charts. Server components (no client JS).
 * Lines are drawn in a 0-100 viewBox stretched to the container; strokes use
 * non-scaling-stroke so they stay crisp. Labels are HTML so they never scale with the SVG.
 * Every chart carries an accessible name and a visually hidden data table.
 * Series are told apart by dash pattern as well as colour.
 */

export type TrendPoint = { at: Date; value: number | null };
export type TrendSeries = { label: string; points: TrendPoint[] };

const STROKES = ["var(--accent)", "var(--monitor)", "var(--ink-3)"] as const;
const DASHES = [undefined, "6 5", "2 4"] as const;

function seriesStyle(i: number) {
  return { stroke: STROKES[i % STROKES.length], dash: DASHES[i % DASHES.length] };
}

export function TrendChart({
  series,
  yMin,
  yMax,
  ticks,
  label,
  formatValue = (v) => String(v),
  locale = "en",
  heightClass = "h-44",
  emptyText = "Not enough data yet.",
}: {
  series: TrendSeries[];
  yMin: number;
  yMax: number;
  ticks?: number[];
  /** Accessible name, e.g. "Mood over the last 8 weeks". */
  label: string;
  formatValue?: (v: number) => string;
  locale?: "en" | "hi";
  heightClass?: string;
  emptyText?: string;
}) {
  const points = series.flatMap((s) => s.points.filter((p) => p.value !== null));
  if (points.length < 2) return <p className="text-sm text-ink-3">{emptyText}</p>;
  const t0 = Math.min(...points.map((p) => p.at.getTime()));
  const t1 = Math.max(...points.map((p) => p.at.getTime()));
  const span = Math.max(1, t1 - t0);
  const x = (d: Date) => 2 + ((d.getTime() - t0) / span) * 96;
  const y = (v: number) => 6 + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * 88;
  const tickValues = ticks ?? [yMin, (yMin + yMax) / 2, yMax];
  const allTimes = [...new Set(points.map((p) => p.at.getTime()))].sort((a, b) => a - b);

  return (
    <figure className="grid gap-2">
      <div className="grid grid-cols-[2.25rem_1fr] gap-2">
        <div className={cx("relative", heightClass)} aria-hidden>
          {tickValues.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 font-mono text-xs text-ink-3 tabular-nums"
              style={{ top: `${y(t)}%` }}
            >
              {formatValue(t)}
            </span>
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cx("w-full overflow-visible", heightClass)} role="img" aria-label={label}>
          {tickValues.map((t) => (
            <line key={t} x1={0} x2={100} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s, i) => {
            const pts = s.points.filter((p): p is { at: Date; value: number } => p.value !== null);
            const { stroke, dash } = seriesStyle(i);
            return (
              <g key={s.label}>
                <polyline
                  points={pts.map((p) => `${x(p.at)},${y(p.value)}`).join(" ")}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray={dash}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {pts.map((p) => (
                  // A zero-length line with round caps renders as a dot that does not stretch.
                  <line
                    key={p.at.getTime()}
                    x1={x(p.at)}
                    x2={x(p.at)}
                    y1={y(p.value)}
                    y2={y(p.value)}
                    stroke={stroke}
                    strokeWidth={6}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="ml-[2.75rem] flex justify-between font-mono text-xs text-ink-3" aria-hidden>
        <span>{fmtDay(new Date(t0), locale)}</span>
        <span>{fmtDay(new Date(t1), locale)}</span>
      </div>
      {series.length > 1 ? (
        <figcaption className="ml-[2.75rem] flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {series.map((s, i) => {
            const { stroke, dash } = seriesStyle(i);
            return (
              <span key={s.label} className="inline-flex items-center gap-2">
                <svg width="22" height="8" aria-hidden>
                  <line x1="1" x2="21" y1="4" y2="4" stroke={stroke} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
                </svg>
                {s.label}
              </span>
            );
          })}
        </figcaption>
      ) : null}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.label} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTimes.map((t) => (
            <tr key={t}>
              <th scope="row">{fmtDay(new Date(t), locale)}</th>
              {series.map((s) => {
                const p = s.points.find((q) => q.at.getTime() === t);
                return <td key={s.label}>{p?.value === null || p?.value === undefined ? "-" : formatValue(p.value)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Inline mini trend for tables and lists. */
export function Sparkline({ values, min, max, label, className }: { values: number[]; min: number; max: number; label: string; className?: string }) {
  if (values.length < 2) return <span className="text-sm text-ink-3">-</span>;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 8 + (1 - (v - min) / Math.max(1e-9, max - min)) * 84;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cx("h-6 w-20", className)} role="img" aria-label={label}>
      <polyline
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Horizontal bars without a background track. A null value renders `suppressedText`
 * (used for small-cohort suppression) instead of a bar. */
export function BarList({
  items,
  max,
  format = (v) => String(v),
  suppressedText = "Hidden: group too small",
}: {
  items: { key?: string; label: ReactNode; value: number | null; note?: ReactNode }[];
  max?: number;
  format?: (v: number) => string;
  suppressedText?: string;
}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <ul className="grid gap-3.5">
      {items.map((item, idx) => (
        <li key={item.key ?? idx} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{item.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-ink-2">{item.value === null ? suppressedText : format(item.value)}</span>
          </div>
          {item.value !== null && item.value > 0 ? (
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(1.5, Math.min(100, (item.value / m) * 100))}%` }} aria-hidden />
          ) : null}
          {item.note ? <p className="text-xs text-ink-3">{item.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
