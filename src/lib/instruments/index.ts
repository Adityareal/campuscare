import type { Instrument } from "@/generated/prisma/enums";
import { fail } from "@/lib/errors";

/**
 * Validated screening instruments. Item wording is reproduced verbatim from the published
 * English versions and must not be edited for style (including punctuation): changing the
 * wording changes the instrument. Translations are only shown once a validated translation
 * has been loaded and reviewed; until then `validatedLocales` is ["en"] and the UI shows the
 * English text with an explanation in the student's language.
 */

export type SeverityBand = "MINIMAL" | "MILD" | "MODERATE" | "MODERATELY_SEVERE" | "SEVERE";

export type InstrumentDefinition = {
  code: Instrument;
  name: string;
  version: string;
  scoringVersion: string;
  stem: string;
  items: readonly string[];
  options: readonly { value: number; label: string }[];
  difficultyQuestion: string;
  difficultyOptions: readonly string[];
  bands: readonly { band: SeverityBand; min: number; max: number }[];
  /** 1-based item number whose positive answer is a potential safety concern. */
  safetyItem: number | null;
  validatedLocales: readonly ("en" | "hi")[];
  attribution: string;
};

const FREQUENCY_OPTIONS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
] as const;

const DIFFICULTY_OPTIONS = ["Not difficult at all", "Somewhat difficult", "Very difficult", "Extremely difficult"] as const;

const PFIZER_ATTRIBUTION =
  "Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.";

export const PHQ9: InstrumentDefinition = {
  code: "PHQ9",
  name: "PHQ-9",
  version: "PHQ-9 (Kroenke, Spitzer & Williams, 2001)",
  scoringVersion: "phq9-sum-v1",
  stem: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
  items: [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed, or hopeless",
    "Trouble falling or staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself \u2014 or that you are a failure or have let yourself or your family down",
    "Trouble concentrating on things, such as reading the newspaper or watching television",
    "Moving or speaking so slowly that other people could have noticed? Or the opposite \u2014 being so fidgety or restless that you have been moving around a lot more than usual",
    "Thoughts that you would be better off dead or of hurting yourself in some way",
  ],
  options: FREQUENCY_OPTIONS,
  difficultyQuestion:
    "If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?",
  difficultyOptions: DIFFICULTY_OPTIONS,
  bands: [
    { band: "MINIMAL", min: 0, max: 4 },
    { band: "MILD", min: 5, max: 9 },
    { band: "MODERATE", min: 10, max: 14 },
    { band: "MODERATELY_SEVERE", min: 15, max: 19 },
    { band: "SEVERE", min: 20, max: 27 },
  ],
  safetyItem: 9,
  validatedLocales: ["en"],
  attribution: PFIZER_ATTRIBUTION,
};

export const GAD7: InstrumentDefinition = {
  code: "GAD7",
  name: "GAD-7",
  version: "GAD-7 (Spitzer, Kroenke, Williams & L\u00f6we, 2006)",
  scoringVersion: "gad7-sum-v1",
  stem: "Over the last 2 weeks, how often have you been bothered by the following problems?",
  items: [
    "Feeling nervous, anxious, or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it is hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid, as if something awful might happen",
  ],
  options: FREQUENCY_OPTIONS,
  difficultyQuestion:
    "If you checked any problems, how difficult have they made it for you to do your work, take care of things at home, or get along with other people?",
  difficultyOptions: DIFFICULTY_OPTIONS,
  bands: [
    { band: "MINIMAL", min: 0, max: 4 },
    { band: "MILD", min: 5, max: 9 },
    { band: "MODERATE", min: 10, max: 14 },
    { band: "SEVERE", min: 15, max: 21 },
  ],
  safetyItem: null,
  validatedLocales: ["en"],
  attribution: PFIZER_ATTRIBUTION,
};

export const INSTRUMENTS: Record<Instrument, InstrumentDefinition> = { PHQ9, GAD7 };

export function instrumentFor(code: Instrument): InstrumentDefinition {
  return INSTRUMENTS[code];
}

export type ScoreResult = {
  total: number;
  band: SeverityBand;
  safetyItemPositive: boolean;
  functionalDifficulty: number | null;
  scoringVersion: string;
};

/** Scores a complete response set. Incomplete or out-of-range answers are rejected rather than
 * prorated: a partial screen is reported as incomplete, never as a lower score. */
export function scoreInstrument(
  def: InstrumentDefinition,
  responses: readonly number[],
  functionalDifficulty: number | null = null,
): ScoreResult {
  if (responses.length !== def.items.length) {
    fail("VALIDATION", `${def.name} needs an answer for all ${def.items.length} questions.`);
  }
  for (const v of responses) {
    if (!Number.isInteger(v) || v < 0 || v > 3) fail("VALIDATION", `${def.name} answers must be between 0 and 3.`);
  }
  if (functionalDifficulty !== null && (!Number.isInteger(functionalDifficulty) || functionalDifficulty < 0 || functionalDifficulty > 3)) {
    fail("VALIDATION", "The difficulty answer is out of range.");
  }
  const total = responses.reduce((a, b) => a + b, 0);
  const band = def.bands.find((b) => total >= b.min && total <= b.max);
  if (!band) fail("VALIDATION", `${def.name} total ${total} is outside the scoring range.`);
  const safetyItemPositive = def.safetyItem !== null && (responses[def.safetyItem - 1] ?? 0) > 0;
  return { total, band: band.band, safetyItemPositive, functionalDifficulty, scoringVersion: def.scoringVersion };
}

export const BAND_LABEL: Record<SeverityBand, string> = {
  MINIMAL: "Minimal",
  MILD: "Mild",
  MODERATE: "Moderate",
  MODERATELY_SEVERE: "Moderately severe",
  SEVERE: "Severe",
};

export function maxScore(def: InstrumentDefinition): number {
  return def.items.length * 3;
}
