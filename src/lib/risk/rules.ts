import { z } from "zod";
import type { TriageCategory } from "@/generated/prisma/enums";

export const CATEGORY_RANK: Record<TriageCategory, number> = { ROUTINE: 0, MONITOR: 1, PRIORITY: 2, URGENT: 3 };

export function maxCategory(...cats: TriageCategory[]): TriageCategory {
  return cats.reduce<TriageCategory>((a, b) => (CATEGORY_RANK[b] > CATEGORY_RANK[a] ? b : a), "ROUTINE");
}

const alertCategory = z.enum(["MONITOR", "PRIORITY", "URGENT"]);
const bandCategory = z.enum(["NONE", "MONITOR", "PRIORITY"]);
const days = z.number().int().min(1).max(180);

/**
 * Institution-configurable triage rules. Defaults are engineering starting points chosen to
 * err toward human review; they must be signed off by the pilot's clinical lead before use.
 * Safety rules (PHQ-9 item 9, urgent help requests) can be tuned but never switched off.
 */
export const RiskRulesSchema = z.object({
  version: z.number().int().positive(),
  checkInLookbackDays: days,
  phq9SafetyItem: z.object({ enabled: z.literal(true), category: z.enum(["PRIORITY", "URGENT"]), withinDays: days }),
  phq9Bands: z.object({ MODERATE: bandCategory, MODERATELY_SEVERE: bandCategory, SEVERE: bandCategory, withinDays: days }),
  gad7Bands: z.object({ MODERATE: bandCategory, SEVERE: bandCategory, withinDays: days }),
  scoreRise: z.object({
    enabled: z.boolean(),
    phq9Points: z.number().int().min(2).max(15),
    gad7Points: z.number().int().min(2).max(12),
    comparisonDays: days,
    category: alertCategory,
  }),
  sustainedHigh: z.object({
    enabled: z.boolean(),
    threshold: z.number().int().min(3).max(5),
    consecutive: z.number().int().min(2).max(7),
    withinDays: days,
    category: alertCategory,
  }),
  persistentLow: z.object({
    enabled: z.boolean(),
    threshold: z.number().int().min(1).max(3),
    count: z.number().int().min(2).max(7),
    ofLast: z.number().int().min(2).max(10),
    category: alertCategory,
  }),
  decliningWellbeing: z.object({
    enabled: z.boolean(),
    drop: z.number().min(0.5).max(3),
    window: z.number().int().min(2).max(6),
    category: alertCategory,
  }),
  urgentHelpRequest: z.object({ withinDays: days }),
  repeatedHelpRequests: z.object({
    enabled: z.boolean(),
    count: z.number().int().min(2).max(10),
    withinDays: days,
    category: alertCategory,
  }),
  combinedPatterns: z.object({ enabled: z.boolean(), minDomains: z.number().int().min(2).max(3) }),
  closedCooldownDays: z.number().int().min(0).max(60),
});

export type RiskRules = z.infer<typeof RiskRulesSchema>;

export const DEFAULT_RULES: RiskRules = {
  version: 1,
  checkInLookbackDays: 42,
  phq9SafetyItem: { enabled: true, category: "URGENT", withinDays: 14 },
  phq9Bands: { MODERATE: "MONITOR", MODERATELY_SEVERE: "PRIORITY", SEVERE: "PRIORITY", withinDays: 30 },
  gad7Bands: { MODERATE: "MONITOR", SEVERE: "PRIORITY", withinDays: 30 },
  scoreRise: { enabled: true, phq9Points: 5, gad7Points: 4, comparisonDays: 90, category: "MONITOR" },
  sustainedHigh: { enabled: true, threshold: 4, consecutive: 3, withinDays: 21, category: "MONITOR" },
  persistentLow: { enabled: true, threshold: 2, count: 3, ofLast: 4, category: "MONITOR" },
  decliningWellbeing: { enabled: true, drop: 1, window: 3, category: "MONITOR" },
  urgentHelpRequest: { withinDays: 7 },
  repeatedHelpRequests: { enabled: true, count: 3, withinDays: 14, category: "MONITOR" },
  combinedPatterns: { enabled: true, minDomains: 2 },
  closedCooldownDays: 14,
};

/** Parses stored configuration; anything invalid falls back to defaults rather than to "off". */
export function parseRules(stored: unknown): RiskRules {
  const merged = typeof stored === "object" && stored ? { ...DEFAULT_RULES, ...(stored as object) } : DEFAULT_RULES;
  const parsed = RiskRulesSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_RULES;
}

export const RULE_LABELS: Record<string, string> = {
  PHQ9_SAFETY_ITEM: "PHQ-9 question 9 answered above 'Not at all'",
  PHQ9_SEVERITY: "PHQ-9 score in a configured range",
  GAD7_SEVERITY: "GAD-7 score in a configured range",
  PHQ9_SCORE_RISE: "PHQ-9 score rose since the previous screen",
  GAD7_SCORE_RISE: "GAD-7 score rose since the previous screen",
  SUSTAINED_HIGH_STRESS: "High stress across consecutive check-ins",
  SUSTAINED_ACADEMIC_PRESSURE: "High academic pressure across consecutive check-ins",
  PERSISTENT_LOW_MOOD: "Low mood in most recent check-ins",
  REPEATED_POOR_SLEEP: "Poor sleep in most recent check-ins",
  PERSISTENT_ISOLATION: "Low social connection in most recent check-ins",
  DECLINING_WELLBEING: "Self-reported well-being declining",
  URGENT_HELP_REQUEST: "Student asked for urgent support",
  REPEATED_HELP_REQUESTS: "Several support requests in a short period",
  COMBINED_PATTERNS: "Concerns from more than one source at the same time",
};
