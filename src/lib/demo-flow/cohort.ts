import { suppressCells, effectiveK, type ReportedCell } from "@/lib/privacy/suppression";
import { SAMPLE_COHORT, STUDENT_DEPARTMENT } from "@/lib/demo-flow/content";

export type CohortRow = ReportedCell<number> & { reasonText: string | null };

export type CohortView = {
  k: number;
  rows: CohortRow[];
  total: number;
  hidden: number;
};

const REASON_TEXT = {
  small_group: (k: number) => `Fewer than ${k} students, so the group is hidden.`,
  complementary: () => "Hidden as well, so the hidden group cannot be worked out by subtracting from the total.",
} as const;

/**
 * The administrator's view of a sample cohort, produced by the real suppression function. The
 * sample student adds one to their department only when they agreed to anonymous statistics.
 */
export function cohortView(minGroup: number, studentCounted: boolean): CohortView {
  const k = effectiveK(minGroup);
  const cells = SAMPLE_COHORT.map((c) => ({
    key: c.key,
    n: c.n + (studentCounted && c.key === STUDENT_DEPARTMENT ? 1 : 0),
    value: c.meanMood,
  }));
  const reported = suppressCells(cells, k, { totalShown: true });
  const rows: CohortRow[] = reported.map((r) => ({
    ...r,
    reasonText: r.reason === "small_group" ? REASON_TEXT.small_group(k) : r.reason === "complementary" ? REASON_TEXT.complementary() : null,
  }));
  return { k, rows, total: cells.reduce((a, c) => a + c.n, 0), hidden: rows.filter((r) => r.suppressed).length };
}
