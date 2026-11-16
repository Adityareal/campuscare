import type { TriageCategory } from "@/generated/prisma/enums";
import { BAND_LABEL, PHQ9, scoreInstrument, type ScoreResult } from "@/lib/instruments";
import {
  alertTitle,
  evaluateRisk,
  planAlertUpdate,
  RECOMMENDED_ACTION,
  type AlertPlan,
  type AssessmentPoint,
  type CheckInPoint,
  type Finding,
  type HelpPoint,
} from "@/lib/risk/engine";
import { DEFAULT_RULES, RULE_LABELS } from "@/lib/risk/rules";
import { SAMPLE_NOW, SCALE_KEYS, WEEK_OFFSETS_DAYS, type ScaleKey } from "@/lib/demo-flow/content";

const DAY_MS = 86_400_000;

export type Answer = number | null;
export type WeekAnswers = Record<ScaleKey, Answer>;

export type StudentInput = {
  includePatterns: boolean;
  weeks: readonly WeekAnswers[];
  /** Nine PHQ-9 answers, 0 to 3, or null where skipped. */
  phq: readonly Answer[];
  urgentHelp: boolean;
};

export type LogStatus = "fired" | "clear" | "skipped" | "nodata" | "info";

export type LogLine = {
  key: string;
  label: string;
  status: LogStatus;
  detail: string;
  /** Progress in [0, 1] at which the line appears. */
  at: number;
};

export type Evaluation = {
  includePatterns: boolean;
  log: LogLine[];
  findings: Finding[];
  plan: AlertPlan;
  alertRaised: boolean;
  category: TriageCategory;
  title: string | null;
  recommended: string | null;
  phqScore: ScoreResult | null;
  phqComplete: boolean;
  /** PHQ-9 question 9 was answered above "Not at all". Shown to the student before anything else. */
  safetyScreen: boolean;
  submittedWeeks: number;
};

export function emptyWeek(): WeekAnswers {
  return { mood: null, stress: null, sleep: null, energy: null, social: null, academicPressure: null };
}

export function emptyPhq(): Answer[] {
  return Array.from({ length: PHQ9.items.length }, () => null);
}

export function phqIsComplete(phq: readonly Answer[]): phq is readonly number[] {
  return phq.length === PHQ9.items.length && phq.every((a) => a !== null);
}

export function safetyItemAnswered(phq: readonly Answer[]): boolean {
  const idx = (PHQ9.safetyItem ?? 0) - 1;
  const a = phq[idx];
  return typeof a === "number" && a > 0;
}

const weekSubmitted = (w: WeekAnswers) => SCALE_KEYS.some((k) => w[k] !== null);

function answered(weeks: readonly WeekAnswers[], key: ScaleKey): number {
  return weeks.filter((w) => w[key] !== null).length;
}

const RULE_FIELD: Partial<Record<string, ScaleKey>> = {
  SUSTAINED_HIGH_STRESS: "stress",
  SUSTAINED_ACADEMIC_PRESSURE: "academicPressure",
  PERSISTENT_LOW_MOOD: "mood",
  REPEATED_POOR_SLEEP: "sleep",
  PERSISTENT_ISOLATION: "social",
};

/** Runs the real rule engine and the real alert planner on the sample student's answers. */
export function evaluateStudent(input: StudentInput): Evaluation {
  const rules = DEFAULT_RULES;
  const submitted = input.weeks.map((w, i) => ({ w, i })).filter(({ w }) => weekSubmitted(w));

  const checkIns: CheckInPoint[] = submitted.map(({ w, i }) => ({
    id: `check-in-${i + 1}`,
    at: new Date(SAMPLE_NOW.getTime() - (WEEK_OFFSETS_DAYS[i] ?? 0) * DAY_MS),
    mood: w.mood,
    stress: w.stress,
    sleep: w.sleep,
    energy: w.energy,
    social: w.social,
    academicPressure: w.academicPressure,
  }));

  const phqScore = phqIsComplete(input.phq) ? scoreInstrument(PHQ9, input.phq) : null;
  const phqComplete = phqScore !== null;
  const assessments: AssessmentPoint[] = phqScore
    ? [{ id: "phq9-1", at: SAMPLE_NOW, instrument: "PHQ9", total: phqScore.total, band: phqScore.band, safetyItemPositive: phqScore.safetyItemPositive }]
    : [];

  const helpRequests: HelpPoint[] = input.urgentHelp ? [{ id: "help-1", at: SAMPLE_NOW, type: "URGENT_SUPPORT" }] : [];

  const result = evaluateRisk({
    now: SAMPLE_NOW,
    rules,
    includePatterns: input.includePatterns,
    checkIns,
    assessments,
    helpRequests,
  });

  const plan = planAlertUpdate(
    result.findings,
    { open: null, seenDedupeKeys: new Set(), recentlyClosed: [] },
    SAMPLE_NOW,
    rules.closedCooldownDays,
  );
  const alertRaised = plan.action === "create";
  const category: TriageCategory = alertRaised ? plan.category : "ROUTINE";

  const fired = new Set(result.findings.map((f) => f.ruleCode));
  const lines: Omit<LogLine, "at">[] = [];
  lines.push({
    key: "consent",
    label: "Consent to care-team review",
    status: "info",
    detail: input.includePatterns
      ? "On. Check-in and questionnaire patterns are evaluated."
      : "Off. Patterns are not evaluated. Only an explicit request for help is checked.",
  });

  for (const code of Object.keys(RULE_LABELS)) {
    lines.push({ key: code, label: RULE_LABELS[code] ?? code, ...ruleStatus(code, fired.has(code), input, submitted.length, helpRequests.length) });
  }

  lines.push({
    key: "plan",
    label: "Plan the alert against an empty history",
    status: "info",
    detail: alertRaised
      ? `Create one alert from ${plan.findings.length} finding${plan.findings.length === 1 ? "" : "s"}, category ${categoryWord(category)}.`
      : "Nothing to raise.",
  });

  const n = lines.length;
  const log: LogLine[] = lines.map((l, i) => ({ ...l, at: n === 1 ? 1 : (i + 1) / n }));

  return {
    includePatterns: input.includePatterns,
    log,
    findings: plan.findings,
    plan,
    alertRaised,
    category,
    title: alertRaised ? alertTitle(category, plan.findings) : null,
    recommended: alertRaised ? RECOMMENDED_ACTION[category] : null,
    phqScore,
    phqComplete,
    safetyScreen: safetyItemAnswered(input.phq),
    submittedWeeks: submitted.length,
  };
}

function categoryWord(c: TriageCategory): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function ruleStatus(
  code: string,
  didFire: boolean,
  input: StudentInput,
  submittedWeeks: number,
  helpCount: number,
): Pick<LogLine, "status" | "detail"> {
  const rules = DEFAULT_RULES;
  if (code === "URGENT_HELP_REQUEST") {
    return didFire ? { status: "fired", detail: "An urgent support request was sent." } : { status: "clear", detail: "No urgent support request." };
  }
  if (code === "REPEATED_HELP_REQUESTS") {
    return didFire
      ? { status: "fired", detail: "Threshold reached." }
      : { status: "clear", detail: `${helpCount} request${helpCount === 1 ? "" : "s"}, threshold ${rules.repeatedHelpRequests.count}.` };
  }
  if (!input.includePatterns) {
    return { status: "skipped", detail: "Not evaluated because care-team review is off." };
  }
  if (code.startsWith("GAD7")) return { status: "nodata", detail: "No GAD-7 in this walk." };
  if (code.endsWith("SCORE_RISE")) return { status: "nodata", detail: "Needs two screens. This walk has at most one." };
  if (code === "PHQ9_SAFETY_ITEM" || code === "PHQ9_SEVERITY") {
    if (!phqIsComplete(input.phq)) return { status: "nodata", detail: "No completed PHQ-9. All nine answers are needed to score it." };
    return didFire ? { status: "fired", detail: "Matched." } : { status: "clear", detail: "No match." };
  }
  if (code === "DECLINING_WELLBEING") {
    const need = rules.decliningWellbeing.window * 2;
    if (submittedWeeks < need) return { status: "nodata", detail: `Needs ${need} check-ins. This walk has ${submittedWeeks}.` };
    return didFire ? { status: "fired", detail: "Matched." } : { status: "clear", detail: "No match." };
  }
  const field = RULE_FIELD[code];
  if (field) {
    const need = code.startsWith("SUSTAINED") ? rules.sustainedHigh.consecutive : rules.persistentLow.ofLast;
    const have = answered(input.weeks, field);
    if (have < need) return { status: "nodata", detail: `Needs ${need} answers. ${have} given.` };
    return didFire ? { status: "fired", detail: "Matched." } : { status: "clear", detail: "No match." };
  }
  if (code === "COMBINED_PATTERNS") {
    return didFire
      ? { status: "fired", detail: "Two independent sources raised a concern." }
      : { status: "clear", detail: "Fewer than two independent sources raised a concern." };
  }
  return didFire ? { status: "fired", detail: "Matched." } : { status: "clear", detail: "No match." };
}

export const STATUS_LABEL: Record<LogStatus, string> = {
  fired: "Fired",
  clear: "No match",
  skipped: "Not evaluated",
  nodata: "Not enough data",
  info: "Note",
};

export function phqSummary(score: ScoreResult | null): string | null {
  if (!score) return null;
  return `${score.total} of 27, in the ${BAND_LABEL[score.band].toLowerCase()} range. This is a screening score, not a diagnosis.`;
}
