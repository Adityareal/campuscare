/**
 * Small-group suppression for institutional analytics (PRD F2 and F5).
 *
 * A cell is any reported number that describes a group of students (a department's average
 * mood, a year group's participation rate). Cells covering fewer than k distinct students are
 * hidden. If a breakdown also shows its total, hiding a single cell is not enough because it
 * can be recovered by subtraction, so the next smallest visible cell is hidden as well
 * ("complementary suppression").
 */

/** Never report a group smaller than this, whatever an institution configures. */
export const ABSOLUTE_MIN_COHORT = 5;

export type Cell<T> = { key: string; n: number; value: T };

export type ReportedCell<T> = {
  key: string;
  /** Group size, or null when hidden. */
  n: number | null;
  value: T | null;
  suppressed: boolean;
  reason: "small_group" | "complementary" | null;
};

export function effectiveK(configured: number): number {
  return Math.max(ABSOLUTE_MIN_COHORT, Math.floor(Number.isFinite(configured) ? configured : ABSOLUTE_MIN_COHORT));
}

export function suppressCells<T>(cells: readonly Cell<T>[], k: number, opts: { totalShown?: boolean } = {}): ReportedCell<T>[] {
  const kk = effectiveK(k);
  const out: ReportedCell<T>[] = cells.map((c) =>
    c.n < kk
      ? { key: c.key, n: null, value: null, suppressed: true, reason: "small_group" }
      : { key: c.key, n: c.n, value: c.value, suppressed: false, reason: null },
  );
  const hidden = out.filter((c) => c.suppressed).length;
  if (opts.totalShown && hidden === 1) {
    let pick = -1;
    let smallest = Number.POSITIVE_INFINITY;
    cells.forEach((c, i) => {
      if (!out[i]?.suppressed && c.n < smallest) {
        smallest = c.n;
        pick = i;
      }
    });
    const target = cells[pick];
    if (target) out[pick] = { key: target.key, n: null, value: null, suppressed: true, reason: "complementary" };
  }
  return out;
}

/** A single aggregate (a mean, a rate) is reportable only when its base covers at least k students. */
export function reportable<T>(n: number, value: T, k: number): T | null {
  return n >= effectiveK(k) ? value : null;
}
