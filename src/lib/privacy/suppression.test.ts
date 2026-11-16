import "@/test/env";
import { describe, expect, it } from "vitest";
import { ABSOLUTE_MIN_COHORT, effectiveK, reportable, suppressCells, type Cell } from "@/lib/privacy/suppression";

const cells = (...ns: number[]): Cell<number>[] => ns.map((n, i) => ({ key: `k${i}`, n, value: n * 10 }));

describe("effectiveK", () => {
  it("never goes below the floor of 5", () => {
    expect(ABSOLUTE_MIN_COHORT).toBe(5);
    expect(effectiveK(0)).toBe(5);
    expect(effectiveK(3)).toBe(5);
    expect(effectiveK(-10)).toBe(5);
    expect(effectiveK(Number.NaN)).toBe(5);
    expect(effectiveK(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it("uses a larger configured size", () => {
    expect(effectiveK(10)).toBe(10);
    expect(effectiveK(7.9)).toBe(7);
  });
});

describe("suppressCells", () => {
  it("hides groups below the floor even when a smaller size is configured", () => {
    const out = suppressCells(cells(4, 5), 1);
    expect(out[0]).toEqual({ key: "k0", n: null, value: null, suppressed: true, reason: "small_group" });
    expect(out[1]).toEqual({ key: "k1", n: 5, value: 50, suppressed: false, reason: null });
  });

  it("hides a single small cell only when no total is shown", () => {
    const out = suppressCells(cells(3, 6, 8, 20), 5);
    expect(out.map((c) => c.suppressed)).toEqual([true, false, false, false]);
  });

  it("adds complementary suppression of the next smallest cell when a total is shown", () => {
    const out = suppressCells(cells(3, 8, 6, 20), 5, { totalShown: true });
    expect(out.map((c) => c.reason)).toEqual(["small_group", null, "complementary", null]);
    expect(out[2]?.n).toBeNull();
    expect(out[2]?.value).toBeNull();
  });

  it("needs no complementary cell when two or more are already hidden", () => {
    const out = suppressCells(cells(3, 2, 8, 20), 5, { totalShown: true });
    expect(out.map((c) => c.reason)).toEqual(["small_group", "small_group", null, null]);
  });

  it("hides nothing when every group is large enough", () => {
    expect(suppressCells(cells(5, 9), 5, { totalShown: true }).every((c) => !c.suppressed)).toBe(true);
  });
});

describe("reportable", () => {
  it("reports a single aggregate only from the floor up", () => {
    expect(reportable(4, 3.2, 1)).toBeNull();
    expect(reportable(5, 3.2, 1)).toBe(3.2);
    expect(reportable(9, 3.2, 10)).toBeNull();
  });
});
