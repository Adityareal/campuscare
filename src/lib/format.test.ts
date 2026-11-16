import "@/test/env";
import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime, fmtDay, fmtDuration, isoDay, istToUtc, pct, relativeToNow } from "@/lib/format";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("fmtDuration", () => {
  it.each([
    [0, "0 min"],
    [59 * MIN, "59 min"],
    [60 * MIN, "1 h"],
    [200 * MIN, "3 h 20 min"],
    [47 * HOUR + 59 * MIN, "47 h 59 min"],
    [48 * HOUR, "2 days"],
    [-90 * MIN, "1 h 30 min"],
  ])("%i ms is %s", (ms, text) => {
    expect(fmtDuration(ms)).toBe(text);
  });
});

describe("relativeToNow", () => {
  const base = new Date("2026-11-15T06:00:00.000Z");
  it("describes future and past times", () => {
    expect(relativeToNow(new Date(base.getTime() + 2 * HOUR), base)).toBe("in 2 h");
    expect(relativeToNow(new Date(base.getTime() - 15 * MIN), base)).toBe("15 min ago");
  });
});

describe("India time zone helpers", () => {
  it("isoDay uses the IST calendar day", () => {
    // 19:00 UTC is 00:30 IST on the next day.
    expect(isoDay(new Date("2026-11-14T19:00:00.000Z"))).toBe("2026-11-15");
    expect(isoDay(new Date("2026-11-14T18:00:00.000Z"))).toBe("2026-11-14");
  });

  it("istToUtc reads wall-clock time as UTC+05:30", () => {
    expect(istToUtc("2026-11-15", "09:30").toISOString()).toBe("2026-11-15T04:00:00.000Z");
    expect(istToUtc("2026-11-15", "00:15").toISOString()).toBe("2026-11-14T18:45:00.000Z");
  });

  it("date formats render in IST", () => {
    const lateEvening = new Date("2026-11-14T19:00:00.000Z");
    expect(fmtDay(lateEvening)).toContain("15");
    expect(fmtDay(lateEvening)).toContain("Nov");
    expect(fmtDate(lateEvening)).toContain("2026");
    expect(fmtDateTime(lateEvening)).toContain("12:30");
  });
});

describe("pct", () => {
  it("formats a ratio with one decimal and handles a zero denominator", () => {
    expect(pct(1, 3)).toBe("33.3%");
    expect(pct(5, 5)).toBe("100.0%");
    expect(pct(1, 0)).toBe("-");
  });
});
