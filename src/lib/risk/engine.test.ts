import "@/test/env";
import { describe, expect, it } from "vitest";
import type { HelpRequestType, TriageCategory } from "@prisma/client";
import type { SeverityBand } from "@/lib/instruments";
import {
  evaluateRisk,
  planAlertUpdate,
  type AlertHistory,
  type AssessmentPoint,
  type CheckInPoint,
  type Finding,
  type HelpPoint,
  type RiskInput,
} from "@/lib/risk/engine";
import { DEFAULT_RULES, type RiskRules } from "@/lib/risk/rules";

const DAY = 86_400_000;
const MINUTE = 60_000;
const NOW = new Date("2026-11-15T06:30:00.000Z");
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * DAY);

let idSeq = 0;
const nextId = (prefix: string): string => `${prefix}${++idSeq}`;

function checkIn(at: Date, values: Partial<Omit<CheckInPoint, "id" | "at">>): CheckInPoint {
  return {
    id: nextId("c"),
    at,
    mood: null,
    stress: null,
    sleep: null,
    energy: null,
    social: null,
    academicPressure: null,
    ...values,
  };
}

/** One check-in per day, oldest first, ending today. */
function dailyCheckIns(values: Partial<Omit<CheckInPoint, "id" | "at">>[]): CheckInPoint[] {
  return values.map((v, i) => checkIn(daysAgo(values.length - 1 - i), v));
}

function assessment(instrument: "PHQ9" | "GAD7", total: number, band: SeverityBand, at: Date, safetyItemPositive = false): AssessmentPoint {
  return { id: nextId("a"), at, instrument, total, band, safetyItemPositive };
}

function help(type: HelpRequestType, at: Date): HelpPoint {
  return { id: nextId("h"), at, type };
}

function run(partial: Partial<RiskInput>, rules: RiskRules = DEFAULT_RULES) {
  return evaluateRisk({ now: NOW, rules, includePatterns: true, checkIns: [], assessments: [], helpRequests: [], ...partial });
}

const codes = (findings: Finding[]): string[] => findings.map((f) => f.ruleCode).sort();

describe("evaluateRisk: screening rules", () => {
  it("PHQ-9 question 9 fires within the window and not just outside it", () => {
    const inside = run({ assessments: [assessment("PHQ9", 1, "MINIMAL", daysAgo(14), true)] });
    expect(codes(inside.findings)).toEqual(["PHQ9_SAFETY_ITEM"]);
    expect(inside.category).toBe("URGENT");
    expect(inside.findings[0]?.anchored).toBe(true);

    const outside = run({ assessments: [assessment("PHQ9", 1, "MINIMAL", new Date(daysAgo(14).getTime() - MINUTE), true)] });
    expect(outside.findings).toEqual([]);
  });

  it("PHQ-9 question 9 does not fire when the item is 0", () => {
    expect(run({ assessments: [assessment("PHQ9", 9, "MILD", daysAgo(1), false)] }).findings).toEqual([]);
  });

  it("PHQ-9 severity fires from the moderate band and not in the mild band", () => {
    const moderate = run({ assessments: [assessment("PHQ9", 10, "MODERATE", daysAgo(1))] });
    expect(codes(moderate.findings)).toEqual(["PHQ9_SEVERITY"]);
    expect(moderate.category).toBe("MONITOR");
    expect(run({ assessments: [assessment("PHQ9", 9, "MILD", daysAgo(1))] }).findings).toEqual([]);
    expect(run({ assessments: [assessment("PHQ9", 15, "MODERATELY_SEVERE", daysAgo(1))] }).category).toBe("PRIORITY");
    expect(run({ assessments: [assessment("PHQ9", 20, "SEVERE", daysAgo(1))] }).category).toBe("PRIORITY");
  });

  it("PHQ-9 severity uses only the latest screen within its window", () => {
    expect(run({ assessments: [assessment("PHQ9", 12, "MODERATE", daysAgo(30))] }).findings).toHaveLength(1);
    expect(run({ assessments: [assessment("PHQ9", 12, "MODERATE", daysAgo(31))] }).findings).toEqual([]);
    const improved = run({ assessments: [assessment("PHQ9", 12, "MODERATE", daysAgo(20)), assessment("PHQ9", 3, "MINIMAL", daysAgo(2))] });
    expect(improved.findings).toEqual([]);
  });

  it("GAD-7 severity fires from the moderate band and not in the mild band", () => {
    const moderate = run({ assessments: [assessment("GAD7", 10, "MODERATE", daysAgo(1))] });
    expect(codes(moderate.findings)).toEqual(["GAD7_SEVERITY"]);
    expect(moderate.category).toBe("MONITOR");
    expect(run({ assessments: [assessment("GAD7", 9, "MILD", daysAgo(1))] }).findings).toEqual([]);
    expect(run({ assessments: [assessment("GAD7", 15, "SEVERE", daysAgo(1))] }).category).toBe("PRIORITY");
  });

  it("PHQ-9 score rise fires at the configured points and not one point below", () => {
    const rise = run({ assessments: [assessment("PHQ9", 4, "MINIMAL", daysAgo(20)), assessment("PHQ9", 9, "MILD", daysAgo(1))] });
    expect(codes(rise.findings)).toEqual(["PHQ9_SCORE_RISE"]);
    const below = run({ assessments: [assessment("PHQ9", 5, "MILD", daysAgo(20)), assessment("PHQ9", 9, "MILD", daysAgo(1))] });
    expect(below.findings).toEqual([]);
  });

  it("GAD-7 score rise fires at the configured points and not one point below", () => {
    const rise = run({ assessments: [assessment("GAD7", 2, "MINIMAL", daysAgo(20)), assessment("GAD7", 6, "MILD", daysAgo(1))] });
    expect(codes(rise.findings)).toEqual(["GAD7_SCORE_RISE"]);
    const below = run({ assessments: [assessment("GAD7", 3, "MINIMAL", daysAgo(20)), assessment("GAD7", 6, "MILD", daysAgo(1))] });
    expect(below.findings).toEqual([]);
  });

  it("score rise ignores comparisons further apart than the comparison window", () => {
    const far = run({ assessments: [assessment("PHQ9", 0, "MINIMAL", daysAgo(95)), assessment("PHQ9", 9, "MILD", daysAgo(1))] });
    expect(far.findings).toEqual([]);
  });
});

describe("evaluateRisk: check-in rules", () => {
  it("sustained high stress fires at the threshold across the configured run", () => {
    const fires = run({ checkIns: dailyCheckIns([{ stress: 4 }, { stress: 4 }, { stress: 4 }]) });
    expect(codes(fires.findings)).toEqual(["SUSTAINED_HIGH_STRESS"]);
    expect(fires.findings[0]?.anchored).toBe(false);
    expect(fires.category).toBe("MONITOR");
  });

  it("sustained high stress does not fire just below the threshold or with too few check-ins", () => {
    expect(run({ checkIns: dailyCheckIns([{ stress: 4 }, { stress: 3 }, { stress: 4 }]) }).findings).toEqual([]);
    expect(run({ checkIns: dailyCheckIns([{ stress: 5 }, { stress: 5 }]) }).findings).toEqual([]);
  });

  it("sustained high stress only counts the most recent check-ins", () => {
    expect(run({ checkIns: dailyCheckIns([{ stress: 5 }, { stress: 5 }, { stress: 5 }, { stress: 2 }]) }).findings).toEqual([]);
  });

  it("sustained high stress needs every check-in in the run within its window", () => {
    const old = [checkIn(daysAgo(22), { stress: 5 }), checkIn(daysAgo(2), { stress: 5 }), checkIn(daysAgo(1), { stress: 5 })];
    expect(run({ checkIns: old }).findings).toEqual([]);
    const recent = [checkIn(daysAgo(21), { stress: 5 }), checkIn(daysAgo(2), { stress: 5 }), checkIn(daysAgo(1), { stress: 5 })];
    expect(codes(run({ checkIns: recent }).findings)).toEqual(["SUSTAINED_HIGH_STRESS"]);
  });

  it("sustained academic pressure fires at the threshold and not below it", () => {
    expect(codes(run({ checkIns: dailyCheckIns([{ academicPressure: 4 }, { academicPressure: 5 }, { academicPressure: 4 }]) }).findings)).toEqual([
      "SUSTAINED_ACADEMIC_PRESSURE",
    ]);
    expect(run({ checkIns: dailyCheckIns([{ academicPressure: 3 }, { academicPressure: 5 }, { academicPressure: 4 }]) }).findings).toEqual([]);
  });

  it.each([
    ["mood", "PERSISTENT_LOW_MOOD"],
    ["sleep", "REPEATED_POOR_SLEEP"],
    ["social", "PERSISTENT_ISOLATION"],
  ] as const)("persistent low %s fires at 3 of the last 4 at or below 2", (field, code) => {
    const at = (vals: number[]) => dailyCheckIns(vals.map((v) => ({ [field]: v }) as Partial<Omit<CheckInPoint, "id" | "at">>));
    expect(codes(run({ checkIns: at([2, 4, 2, 2]) }).findings)).toEqual([code]);
    // Only two low values, and a 3 is above the threshold.
    expect(run({ checkIns: at([2, 4, 3, 2]) }).findings).toEqual([]);
    // Too few check-ins to judge.
    expect(run({ checkIns: at([1, 1, 1]) }).findings).toEqual([]);
  });

  it("declining well-being fires when the average drops by the configured amount and not less", () => {
    const pts = (vals: number[]) => dailyCheckIns(vals.map((v) => ({ mood: v, energy: v })));
    expect(codes(run({ checkIns: pts([4, 4, 4, 3, 3, 3]) }).findings)).toEqual(["DECLINING_WELLBEING"]);
    expect(run({ checkIns: pts([4, 4, 4, 3, 3, 4]) }).findings).toEqual([]);
    expect(run({ checkIns: pts([4, 4, 3, 3, 3]) }).findings).toEqual([]);
  });

  it("ignores check-ins outside the lookback window", () => {
    const old = [43, 42.5, 42.2].map((d) => checkIn(daysAgo(d), { stress: 5 }));
    expect(run({ checkIns: old }).findings).toEqual([]);
  });
});

describe("evaluateRisk: help-seeking rules", () => {
  it("an urgent help request is an URGENT anchored finding within its window", () => {
    const r = run({ helpRequests: [help("URGENT_SUPPORT", daysAgo(7))] });
    expect(codes(r.findings)).toEqual(["URGENT_HELP_REQUEST"]);
    expect(r.category).toBe("URGENT");
    expect(r.findings[0]?.anchored).toBe(true);
    expect(run({ helpRequests: [help("URGENT_SUPPORT", new Date(daysAgo(7).getTime() - MINUTE))] }).findings).toEqual([]);
  });

  it("a non-urgent help request alone raises nothing", () => {
    expect(run({ helpRequests: [help("ANXIETY", daysAgo(1))] }).findings).toEqual([]);
  });

  it("repeated help requests fire at the configured count and not one below", () => {
    const three = [help("GENERAL_SUPPORT", daysAgo(10)), help("ANXIETY", daysAgo(5)), help("ACADEMIC_STRESS", daysAgo(1))];
    expect(codes(run({ helpRequests: three }).findings)).toEqual(["REPEATED_HELP_REQUESTS"]);
    expect(run({ helpRequests: three.slice(1) }).findings).toEqual([]);
    const spread = [help("GENERAL_SUPPORT", daysAgo(15)), help("ANXIETY", daysAgo(5)), help("ACADEMIC_STRESS", daysAgo(1))];
    expect(run({ helpRequests: spread }).findings).toEqual([]);
  });
});

describe("evaluateRisk: consent and corroboration", () => {
  it("evaluates only help requests when patterns are not permitted", () => {
    const r = run({
      includePatterns: false,
      checkIns: dailyCheckIns([{ stress: 5, mood: 1 }, { stress: 5, mood: 1 }, { stress: 5, mood: 1 }, { stress: 5, mood: 1 }]),
      assessments: [assessment("PHQ9", 22, "SEVERE", daysAgo(1), true)],
      helpRequests: [help("GENERAL_SUPPORT", daysAgo(3)), help("ANXIETY", daysAgo(2)), help("ACADEMIC_STRESS", daysAgo(1))],
    });
    expect(codes(r.findings)).toEqual(["REPEATED_HELP_REQUESTS"]);
    expect(r.findings.every((f) => f.domain === "HELP_SEEKING")).toBe(true);
  });

  it("an urgent help request is still evaluated without pattern consent", () => {
    const r = run({ includePatterns: false, helpRequests: [help("URGENT_SUPPORT", daysAgo(0))] });
    expect(r.category).toBe("URGENT");
  });

  it("combined patterns needs MONITOR findings from two independent domains", () => {
    const twoDomains = run({
      checkIns: dailyCheckIns([{ stress: 5 }, { stress: 5 }, { stress: 5 }]),
      assessments: [assessment("PHQ9", 11, "MODERATE", daysAgo(1))],
    });
    expect(codes(twoDomains.findings)).toEqual(["COMBINED_PATTERNS", "PHQ9_SEVERITY", "SUSTAINED_HIGH_STRESS"]);
    expect(twoDomains.category).toBe("PRIORITY");
    const combined = twoDomains.findings.find((f) => f.ruleCode === "COMBINED_PATTERNS");
    expect(combined?.domain).toBe("COMBINED");
    expect(combined?.dedupeKey).toBe("COMBINED_PATTERNS:PHQ9_SEVERITY+SUSTAINED_HIGH_STRESS");

    const oneDomain = run({
      checkIns: dailyCheckIns([
        { stress: 5, academicPressure: 5 },
        { stress: 5, academicPressure: 5 },
        { stress: 5, academicPressure: 5 },
      ]),
    });
    expect(codes(oneDomain.findings)).toEqual(["SUSTAINED_ACADEMIC_PRESSURE", "SUSTAINED_HIGH_STRESS"]);
    expect(oneDomain.category).toBe("MONITOR");
  });

  it("combined patterns can be switched off", () => {
    const rules: RiskRules = { ...DEFAULT_RULES, combinedPatterns: { enabled: false, minDomains: 2 } };
    const r = run(
      { checkIns: dailyCheckIns([{ stress: 5 }, { stress: 5 }, { stress: 5 }]), assessments: [assessment("PHQ9", 11, "MODERATE", daysAgo(1))] },
      rules,
    );
    expect(codes(r.findings)).not.toContain("COMBINED_PATTERNS");
  });
});

describe("evaluateRisk: explanations", () => {
  it("never copies free text from the input into findings", () => {
    const secret = "SECRET-NOTE-TEXT";
    const withText = <T extends object>(p: T): T => ({ ...p, note: secret, details: secret, noteCiphertext: secret });
    const r = run({
      checkIns: dailyCheckIns([{ stress: 5, mood: 1 }, { stress: 5, mood: 1 }, { stress: 5, mood: 1 }, { stress: 5, mood: 1 }]).map(withText),
      assessments: [withText(assessment("PHQ9", 21, "SEVERE", daysAgo(1), true))],
      helpRequests: [withText(help("URGENT_SUPPORT", daysAgo(1)))],
    });
    expect(r.findings.length).toBeGreaterThan(3);
    expect(JSON.stringify(r.findings)).not.toContain(secret);
    for (const f of r.findings) {
      expect(f.explanation.length).toBeGreaterThan(0);
      for (const e of f.evidence) expect(Object.keys(e).sort()).toEqual(["at", "id", "kind", "label", "value"]);
    }
  });

  it("describes screening scores as scores, not diagnoses", () => {
    const r = run({ assessments: [assessment("PHQ9", 12, "MODERATE", daysAgo(1))] });
    expect(r.findings[0]?.explanation).toContain("not a diagnosis");
  });
});

// ---------- planAlertUpdate ----------

function finding(overrides: Partial<Finding> = {}): Finding {
  const ruleCode = overrides.ruleCode ?? "SUSTAINED_HIGH_STRESS";
  return {
    ruleCode,
    ruleVersion: 1,
    domain: "CHECK_IN",
    category: "MONITOR",
    anchored: false,
    dedupeKey: `${ruleCode}:${nextId("k")}`,
    explanation: "Test finding.",
    evidence: [],
    ...overrides,
  };
}

function history(overrides: Partial<AlertHistory> = {}): AlertHistory {
  return { open: null, seenDedupeKeys: new Set(), recentlyClosed: [], ...overrides };
}

const openAlert = (category: TriageCategory, ruleCodes: string[] = []) => ({ id: "alert-1", category, ruleCodes: new Set(ruleCodes) });

describe("planAlertUpdate", () => {
  const COOLDOWN = DEFAULT_RULES.closedCooldownDays;

  it("creates an alert for new findings when none is open", () => {
    const plan = planAlertUpdate([finding()], history(), NOW, COOLDOWN);
    expect(plan.action).toBe("create");
    expect(plan.category).toBe("MONITOR");
    expect(plan.raisedTo).toBeNull();
  });

  it("never re-raises an anchored finding already seen, even after its alert was closed", () => {
    const f = finding({ ruleCode: "PHQ9_SAFETY_ITEM", anchored: true, category: "URGENT", dedupeKey: "PHQ9_SAFETY_ITEM:a1", domain: "SCREENING" });
    const plan = planAlertUpdate([f], history({ seenDedupeKeys: new Set(["PHQ9_SAFETY_ITEM:a1"]) }), NOW, COOLDOWN);
    expect(plan.action).toBe("none");
    expect(plan.suppressed).toHaveLength(1);
    expect(plan.category).toBe("ROUTINE");
  });

  it("accepts an anchored finding on new evidence", () => {
    const f = finding({ ruleCode: "PHQ9_SAFETY_ITEM", anchored: true, category: "URGENT", dedupeKey: "PHQ9_SAFETY_ITEM:a2", domain: "SCREENING" });
    const plan = planAlertUpdate([f], history({ seenDedupeKeys: new Set(["PHQ9_SAFETY_ITEM:a1"]) }), NOW, COOLDOWN);
    expect(plan.action).toBe("create");
    expect(plan.category).toBe("URGENT");
  });

  it("de-duplicates a pattern finding already on the open alert", () => {
    const plan = planAlertUpdate([finding()], history({ open: openAlert("MONITOR", ["SUSTAINED_HIGH_STRESS"]) }), NOW, COOLDOWN);
    expect(plan.action).toBe("none");
    expect(plan.category).toBe("MONITOR");
    expect(plan.suppressed[0]?.reason).toBe("Already on the open alert.");
  });

  it("suppresses a pattern a human closed within the cooldown", () => {
    const closed = [{ ruleCode: "SUSTAINED_HIGH_STRESS", category: "MONITOR" as const, closedAt: daysAgo(COOLDOWN - 1) }];
    const plan = planAlertUpdate([finding()], history({ recentlyClosed: closed }), NOW, COOLDOWN);
    expect(plan.action).toBe("none");
    expect(plan.suppressed).toHaveLength(1);
  });

  it("allows the pattern again once the cooldown has passed", () => {
    const closed = [{ ruleCode: "SUSTAINED_HIGH_STRESS", category: "MONITOR" as const, closedAt: new Date(daysAgo(COOLDOWN).getTime() - MINUTE) }];
    expect(planAlertUpdate([finding()], history({ recentlyClosed: closed }), NOW, COOLDOWN).action).toBe("create");
  });

  it("allows the pattern during the cooldown when it comes back at a higher category", () => {
    const closed = [{ ruleCode: "SUSTAINED_HIGH_STRESS", category: "MONITOR" as const, closedAt: daysAgo(2) }];
    const plan = planAlertUpdate([finding({ category: "PRIORITY" })], history({ recentlyClosed: closed }), NOW, COOLDOWN);
    expect(plan.action).toBe("create");
    expect(plan.category).toBe("PRIORITY");
  });

  it("URGENT findings bypass the cooldown", () => {
    const closed = [{ ruleCode: "COMBINED_PATTERNS", category: "URGENT" as const, closedAt: daysAgo(1) }];
    const plan = planAlertUpdate([finding({ ruleCode: "COMBINED_PATTERNS", category: "URGENT" })], history({ recentlyClosed: closed }), NOW, COOLDOWN);
    expect(plan.action).toBe("create");
    expect(plan.category).toBe("URGENT");
  });

  it("raises the open alert's category when new evidence is higher", () => {
    const plan = planAlertUpdate([finding({ ruleCode: "GAD7_SEVERITY", category: "PRIORITY", domain: "SCREENING" })], history({ open: openAlert("MONITOR", ["SUSTAINED_HIGH_STRESS"]) }), NOW, COOLDOWN);
    expect(plan.action).toBe("attach");
    expect(plan.raisedTo).toBe("PRIORITY");
    expect(plan.category).toBe("PRIORITY");
  });

  it("never lowers the open alert's category", () => {
    const plan = planAlertUpdate([finding({ ruleCode: "PERSISTENT_LOW_MOOD", category: "MONITOR" })], history({ open: openAlert("URGENT", ["URGENT_HELP_REQUEST"]) }), NOW, COOLDOWN);
    expect(plan.action).toBe("attach");
    expect(plan.raisedTo).toBeNull();
    expect(plan.category).toBe("URGENT");
  });
});
