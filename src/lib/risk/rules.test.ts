import "@/test/env";
import { describe, expect, it } from "vitest";
import { CATEGORY_RANK, DEFAULT_RULES, maxCategory, parseRules, RiskRulesSchema } from "@/lib/risk/rules";

describe("parseRules", () => {
  it("returns the defaults for missing or non-object configuration", () => {
    expect(parseRules(null)).toEqual(DEFAULT_RULES);
    expect(parseRules(undefined)).toEqual(DEFAULT_RULES);
    expect(parseRules("strict")).toEqual(DEFAULT_RULES);
    expect(parseRules(42)).toEqual(DEFAULT_RULES);
  });

  it("falls back to the defaults, not to 'off', when any value is invalid", () => {
    const invalid = { ...DEFAULT_RULES, sustainedHigh: { ...DEFAULT_RULES.sustainedHigh, threshold: 9 } };
    expect(parseRules(invalid)).toEqual(DEFAULT_RULES);
    expect(parseRules({ closedCooldownDays: -1 })).toEqual(DEFAULT_RULES);
    expect(parseRules({ checkInLookbackDays: "forever" })).toEqual(DEFAULT_RULES);
  });

  it("keeps valid overrides and fills the rest from the defaults", () => {
    const parsed = parseRules({ closedCooldownDays: 7, sustainedHigh: { ...DEFAULT_RULES.sustainedHigh, threshold: 5 } });
    expect(parsed.closedCooldownDays).toBe(7);
    expect(parsed.sustainedHigh.threshold).toBe(5);
    expect(parsed.phq9SafetyItem).toEqual(DEFAULT_RULES.phq9SafetyItem);
  });

  it("the PHQ-9 safety rule cannot be switched off", () => {
    const off = { ...DEFAULT_RULES, phq9SafetyItem: { ...DEFAULT_RULES.phq9SafetyItem, enabled: false } };
    expect(RiskRulesSchema.safeParse(off).success).toBe(false);
    const parsed = parseRules(off);
    expect(parsed.phq9SafetyItem.enabled).toBe(true);
    expect(parsed).toEqual(DEFAULT_RULES);
  });

  it("the PHQ-9 safety rule cannot be lowered to MONITOR", () => {
    const low = { ...DEFAULT_RULES, phq9SafetyItem: { ...DEFAULT_RULES.phq9SafetyItem, category: "MONITOR" } };
    expect(parseRules(low).phq9SafetyItem.category).toBe("URGENT");
  });

  it("the defaults are themselves valid", () => {
    expect(RiskRulesSchema.safeParse(DEFAULT_RULES).success).toBe(true);
  });
});

describe("categories", () => {
  it("ranks categories from routine to urgent", () => {
    expect(CATEGORY_RANK.ROUTINE).toBeLessThan(CATEGORY_RANK.MONITOR);
    expect(CATEGORY_RANK.MONITOR).toBeLessThan(CATEGORY_RANK.PRIORITY);
    expect(CATEGORY_RANK.PRIORITY).toBeLessThan(CATEGORY_RANK.URGENT);
  });

  it("maxCategory picks the highest and defaults to routine", () => {
    expect(maxCategory()).toBe("ROUTINE");
    expect(maxCategory("MONITOR", "URGENT", "PRIORITY")).toBe("URGENT");
    expect(maxCategory("MONITOR", "ROUTINE")).toBe("MONITOR");
  });
});
