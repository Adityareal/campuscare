import "@/test/env";
import { describe, expect, it } from "vitest";
import { GAD7, maxScore, PHQ9, scoreInstrument, type InstrumentDefinition, type SeverityBand } from "@/lib/instruments";
import { expectDomainErrorSync } from "@/test/expect";

/** Answers that add up to `total`, filled from the first item. The last items stay 0 unless the
 * total needs them. */
function answersTotalling(def: InstrumentDefinition, total: number): number[] {
  let remaining = total;
  return def.items.map(() => {
    const v = Math.min(3, remaining);
    remaining -= v;
    return v;
  });
}

describe("instrument definitions", () => {
  it("PHQ-9 has 9 items and a safety item at question 9", () => {
    expect(PHQ9.items).toHaveLength(9);
    expect(PHQ9.safetyItem).toBe(9);
    expect(maxScore(PHQ9)).toBe(27);
  });

  it("GAD-7 has 7 items and no safety item", () => {
    expect(GAD7.items).toHaveLength(7);
    expect(GAD7.safetyItem).toBeNull();
    expect(maxScore(GAD7)).toBe(21);
  });
});

describe("PHQ-9 bands", () => {
  const cases: [number, SeverityBand][] = [
    [0, "MINIMAL"],
    [4, "MINIMAL"],
    [5, "MILD"],
    [9, "MILD"],
    [10, "MODERATE"],
    [14, "MODERATE"],
    [15, "MODERATELY_SEVERE"],
    [19, "MODERATELY_SEVERE"],
    [20, "SEVERE"],
    [27, "SEVERE"],
  ];
  it.each(cases)("total %i is %s", (total, band) => {
    const r = scoreInstrument(PHQ9, answersTotalling(PHQ9, total));
    expect(r.total).toBe(total);
    expect(r.band).toBe(band);
    expect(r.scoringVersion).toBe(PHQ9.scoringVersion);
  });
});

describe("GAD-7 bands", () => {
  const cases: [number, SeverityBand][] = [
    [0, "MINIMAL"],
    [4, "MINIMAL"],
    [5, "MILD"],
    [9, "MILD"],
    [10, "MODERATE"],
    [14, "MODERATE"],
    [15, "SEVERE"],
    [21, "SEVERE"],
  ];
  it.each(cases)("total %i is %s", (total, band) => {
    const r = scoreInstrument(GAD7, answersTotalling(GAD7, total));
    expect(r.total).toBe(total);
    expect(r.band).toBe(band);
  });
});

describe("PHQ-9 question 9", () => {
  it("is flagged for any answer above 'Not at all', even with a minimal total", () => {
    for (const v of [1, 2, 3]) {
      const r = scoreInstrument(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, v]);
      expect(r.safetyItemPositive).toBe(true);
      expect(r.band).toBe("MINIMAL");
    }
  });

  it("is not flagged when question 9 is 0, whatever the other answers", () => {
    const r = scoreInstrument(PHQ9, [3, 3, 3, 3, 3, 3, 3, 3, 0]);
    expect(r.total).toBe(24);
    expect(r.safetyItemPositive).toBe(false);
  });

  it("GAD-7 never reports a safety item", () => {
    expect(scoreInstrument(GAD7, [3, 3, 3, 3, 3, 3, 3]).safetyItemPositive).toBe(false);
  });
});

describe("validation", () => {
  it("rejects incomplete and over-long response sets instead of prorating", () => {
    expectDomainErrorSync(() => scoreInstrument(PHQ9, [1, 1, 1, 1, 1, 1, 1, 1]), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(PHQ9, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(GAD7, [1, 1, 1, 1, 1, 1]), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(GAD7, []), "VALIDATION");
  });

  it("rejects out-of-range and non-integer answers", () => {
    expectDomainErrorSync(() => scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, 4]), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, -1]), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, 1.5]), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(PHQ9, [0, 0, 0, 0, 0, 0, 0, 0, Number.NaN]), "VALIDATION");
  });

  it("validates the functional difficulty answer", () => {
    expect(scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, 0], 3).functionalDifficulty).toBe(3);
    expect(scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, 0]).functionalDifficulty).toBeNull();
    expectDomainErrorSync(() => scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, 0], 4), "VALIDATION");
    expectDomainErrorSync(() => scoreInstrument(GAD7, [0, 0, 0, 0, 0, 0, 0], -1), "VALIDATION");
  });
});
