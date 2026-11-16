import type { TriageCategory } from "@/generated/prisma/enums";
import { alertTitle, evaluateRisk, RECOMMENDED_ACTION, type AssessmentPoint, type CheckInPoint, type Finding } from "@/lib/risk/engine";
import { DEFAULT_RULES } from "@/lib/risk/rules";
import { PHQ9, scoreInstrument } from "@/lib/instruments";

/**
 * Sample data for the landing page. Every scenario runs through the same evaluateRisk and
 * DEFAULT_RULES the product uses, so each explanation shown here is the real rule text.
 * The clock is fixed so server and browser render the same dates.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export const SAMPLE_NOW = new Date("2026-11-09T10:00:00+05:30");

export type SampleRatings = { mood?: number | null; stress?: number | null; sleep?: number | null };

/** Weekly check-ins, oldest first. The last one is an hour before SAMPLE_NOW. */
export function weeklyCheckIns(ratings: SampleRatings[]): CheckInPoint[] {
  return ratings.map((r, i) => ({
    id: `sample-${i}`,
    at: new Date(SAMPLE_NOW.getTime() - (ratings.length - 1 - i) * WEEK - 60 * 60 * 1000),
    mood: r.mood ?? null,
    stress: r.stress ?? null,
    sleep: r.sleep ?? null,
    energy: null,
    social: null,
    academicPressure: null,
  }));
}

export type SampleEvaluation = {
  category: TriageCategory;
  findings: Finding[];
  title: string;
  action: string;
};

export function evaluateSample(checkIns: CheckInPoint[], assessments: AssessmentPoint[] = []): SampleEvaluation {
  const result = evaluateRisk({
    now: SAMPLE_NOW,
    rules: DEFAULT_RULES,
    includePatterns: true,
    checkIns,
    assessments,
    helpRequests: [],
  });
  return {
    category: result.category,
    findings: result.findings,
    title: alertTitle(result.category, result.findings),
    action: RECOMMENDED_ACTION[result.category],
  };
}

/** The story told by the hero illustration: three weekly check-ins with stress staying high. */
export const HERO_RATINGS: SampleRatings[] = [
  { mood: 3, stress: 4, sleep: 3 },
  { mood: 2, stress: 5, sleep: 2 },
  { mood: 2, stress: 4, sleep: 1 },
];

export const HERO_CHECK_INS = weeklyCheckIns(HERO_RATINGS);
export const HERO_EVALUATION = evaluateSample(HERO_CHECK_INS);

function phq9Assessment(responses: number[], daysAgo: number): AssessmentPoint {
  const score = scoreInstrument(PHQ9, responses);
  return {
    id: "sample-phq9",
    at: new Date(SAMPLE_NOW.getTime() - daysAgo * DAY),
    instrument: "PHQ9",
    total: score.total,
    band: score.band,
    safetyItemPositive: score.safetyItemPositive,
  };
}

/** Two sample alerts for the counsellor preview. The second combines two independent sources. */
export const QUEUE_ALERTS = [
  {
    id: "alert-a",
    reference: "A-3F7K2Q",
    evaluation: evaluateSample(weeklyCheckIns([{ stress: 4 }, { stress: 4 }, { stress: 5 }])),
  },
  {
    id: "alert-b",
    reference: "A-8M2R5D",
    evaluation: evaluateSample(
      weeklyCheckIns([{ stress: 5 }, { stress: 4 }, { stress: 4 }]),
      [phq9Assessment([2, 2, 2, 2, 1, 1, 1, 1, 0], 3)],
    ),
  },
] as const;

export type DepartmentSample = { key: string; n: number; value: number };

/** Share of students who completed a check-in this month, by sample department. */
export const DEPARTMENT_SAMPLE: DepartmentSample[] = [
  { key: "Sample department A", n: 48, value: 62 },
  { key: "Sample department B", n: 37, value: 55 },
  { key: "Sample department C", n: 6, value: 83 },
  { key: "Sample department D", n: 31, value: 48 },
  { key: "Sample department E", n: 22, value: 59 },
];

export const SAMPLE_MIN_COHORT = 10;
