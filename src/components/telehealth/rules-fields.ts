/** Describes the editable triage rule fields. Paths address keys of the stored rule set. */
export type RuleField =
  | { path: string; label: string; help?: string; kind: "number"; min: number; max: number; step?: number }
  | { path: string; label: string; help?: string; kind: "boolean" }
  | { path: string; label: string; help?: string; kind: "select"; options: { value: string; label: string }[] };

export type RuleGroup = { id: string; title: string; description: string; alwaysOn?: boolean; fields: RuleField[] };

const ALERT_LEVELS = [
  { value: "MONITOR", label: "Monitor" },
  { value: "PRIORITY", label: "Priority" },
  { value: "URGENT", label: "Urgent" },
];
const BAND_LEVELS = [{ value: "NONE", label: "No alert" }, ...ALERT_LEVELS.slice(0, 2)];

const days = (path: string, label = "Look back (days)", help?: string): RuleField => ({ path, label, help, kind: "number", min: 1, max: 180 });
const enabled = (path: string): RuleField => ({ path, label: "Rule is on", kind: "boolean" });
const level = (path: string, label = "Alert level"): RuleField => ({ path, label, kind: "select", options: ALERT_LEVELS });

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: "phq9-safety",
    title: "PHQ-9 question 9",
    description:
      "Any answer above 'Not at all' to the question about thoughts of self-harm raises an alert for human review. This rule is always on and cannot be switched off. You can change its level and how long an answer stays relevant.",
    alwaysOn: true,
    fields: [
      { path: "phq9SafetyItem.category", label: "Alert level", kind: "select", options: ALERT_LEVELS.slice(1) },
      days("phq9SafetyItem.withinDays", "Answer stays relevant for (days)"),
    ],
  },
  {
    id: "phq9-bands",
    title: "PHQ-9 score ranges",
    description: "Raises an alert when a recent PHQ-9 total falls in a range. A score range is a screening result, not a diagnosis.",
    fields: [
      { path: "phq9Bands.MODERATE", label: "Moderate range", kind: "select", options: BAND_LEVELS },
      { path: "phq9Bands.MODERATELY_SEVERE", label: "Moderately severe range", kind: "select", options: BAND_LEVELS },
      { path: "phq9Bands.SEVERE", label: "Severe range", kind: "select", options: BAND_LEVELS },
      days("phq9Bands.withinDays", "Score stays relevant for (days)"),
    ],
  },
  {
    id: "gad7-bands",
    title: "GAD-7 score ranges",
    description: "Raises an alert when a recent GAD-7 total falls in a range. A score range is a screening result, not a diagnosis.",
    fields: [
      { path: "gad7Bands.MODERATE", label: "Moderate range", kind: "select", options: BAND_LEVELS },
      { path: "gad7Bands.SEVERE", label: "Severe range", kind: "select", options: BAND_LEVELS },
      days("gad7Bands.withinDays", "Score stays relevant for (days)"),
    ],
  },
  {
    id: "score-rise",
    title: "Score rise between questionnaires",
    description: "Compares a new questionnaire total with the previous one.",
    fields: [
      enabled("scoreRise.enabled"),
      { path: "scoreRise.phq9Points", label: "PHQ-9 rise (points)", kind: "number", min: 2, max: 15 },
      { path: "scoreRise.gad7Points", label: "GAD-7 rise (points)", kind: "number", min: 2, max: 12 },
      days("scoreRise.comparisonDays", "Compare with scores from the last (days)"),
      level("scoreRise.category"),
    ],
  },
  {
    id: "sustained-high",
    title: "High stress or academic pressure",
    description: "Looks for high ratings across consecutive check-ins.",
    fields: [
      enabled("sustainedHigh.enabled"),
      { path: "sustainedHigh.threshold", label: "Rating at or above (out of 5)", kind: "number", min: 3, max: 5 },
      { path: "sustainedHigh.consecutive", label: "Consecutive check-ins", kind: "number", min: 2, max: 7 },
      days("sustainedHigh.withinDays"),
      level("sustainedHigh.category"),
    ],
  },
  {
    id: "persistent-low",
    title: "Low mood, sleep or social connection",
    description: "Looks for low ratings in most of the recent check-ins.",
    fields: [
      enabled("persistentLow.enabled"),
      { path: "persistentLow.threshold", label: "Rating at or below (out of 5)", kind: "number", min: 1, max: 3 },
      { path: "persistentLow.count", label: "Number of low check-ins", kind: "number", min: 2, max: 7 },
      { path: "persistentLow.ofLast", label: "Out of the most recent check-ins", kind: "number", min: 2, max: 10 },
      level("persistentLow.category"),
    ],
  },
  {
    id: "declining",
    title: "Declining self-reported well-being",
    description: "Compares the average of the latest check-ins with earlier ones.",
    fields: [
      enabled("decliningWellbeing.enabled"),
      { path: "decliningWellbeing.drop", label: "Drop in average rating (points)", kind: "number", min: 0.5, max: 3, step: 0.1 },
      { path: "decliningWellbeing.window", label: "Check-ins in each comparison group", kind: "number", min: 2, max: 6 },
      level("decliningWellbeing.category"),
    ],
  },
  {
    id: "urgent-help",
    title: "Urgent help requests",
    description: "A student asking for urgent support always raises an urgent alert. You can only choose how long the request stays relevant.",
    fields: [days("urgentHelpRequest.withinDays", "Request stays relevant for (days)")],
  },
  {
    id: "repeated-help",
    title: "Repeated help requests",
    description: "Several requests for support in a short period.",
    fields: [
      enabled("repeatedHelpRequests.enabled"),
      { path: "repeatedHelpRequests.count", label: "Number of requests", kind: "number", min: 2, max: 10 },
      days("repeatedHelpRequests.withinDays", "Within (days)"),
      level("repeatedHelpRequests.category"),
    ],
  },
  {
    id: "combined",
    title: "Concerns from more than one source",
    description: "Raises the level when check-ins, questionnaires and help requests all point the same way.",
    fields: [
      enabled("combinedPatterns.enabled"),
      { path: "combinedPatterns.minDomains", label: "Sources needed", kind: "number", min: 2, max: 3 },
    ],
  },
  {
    id: "general",
    title: "General settings",
    description: "Apply to every rule.",
    fields: [
      days("checkInLookbackDays", "Check-ins considered from the last (days)"),
      { path: "closedCooldownDays", label: "Pause after an alert is closed (days)", help: "A closed alert is not raised again for the same pattern during this time.", kind: "number", min: 0, max: 60 },
    ],
  },
];

export function getAt(source: unknown, path: string): unknown {
  let cursor: unknown = source;
  for (const key of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

export function setAt(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    const next = cursor[key];
    if (typeof next !== "object" || next === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (last !== undefined) cursor[last] = value;
}
