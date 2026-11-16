import type { AlertDecision, ReviewerFeedback, TriageCategory } from "@/generated/prisma/enums";
import { en } from "@/lib/i18n/en";

/**
 * Static content for the /try walk. Everything here is sample data or wording restated from the
 * product. The crisis contacts and the decision and feedback labels are copied because their
 * home modules (services/config.ts, services/alerts.ts) import the database and cannot be
 * bundled into a client component.
 */

export type StageId = "student" | "rules" | "decision" | "care" | "leaders";

export const STAGES: readonly { id: StageId; label: string; blurb: string }[] = [
  { id: "student", label: "Be the student", blurb: "Choose what you share, then answer a few check-ins." },
  { id: "rules", label: "The rules run", blurb: "The written rules check your answers, one by one." },
  { id: "decision", label: "A person decides", blurb: "A counsellor reviews the alert and chooses what happens." },
  { id: "care", label: "Care happens", blurb: "A case follows the student until a person closes it." },
  { id: "leaders", label: "What leaders see", blurb: "Administrators see group figures, never individuals." },
];

export function stageIndex(id: StageId): number {
  return STAGES.findIndex((s) => s.id === id);
}

export function parseStage(value: string | string[] | undefined | null): StageId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return STAGES.find((s) => s.id === raw)?.id ?? null;
}

// ---------- Check-in scales (wording from the student app) ----------

export const SCALE_KEYS = ["mood", "stress", "sleep", "energy", "social", "academicPressure"] as const;
export type ScaleKey = (typeof SCALE_KEYS)[number];

export const SCALE_QUESTION: Record<ScaleKey, string> = {
  mood: en.checkIn.mood,
  stress: en.checkIn.stress,
  sleep: en.checkIn.sleep,
  energy: en.checkIn.energy,
  social: en.checkIn.social,
  academicPressure: en.checkIn.academicPressure,
};

export const SCALE_SHORT: Record<ScaleKey, string> = {
  mood: "Mood",
  stress: "Stress",
  sleep: "Sleep",
  energy: "Energy",
  social: "Connection",
  academicPressure: "Academic pressure",
};

export const SCALE_OPTIONS: Record<ScaleKey, readonly string[]> = en.checkIn.scales;

export const CHECK_IN_INTRO = en.checkIn.intro;

export const WEEK_COUNT = 4;

/** Days before the sample "now" for each of the four weekly check-ins, oldest first. */
export const WEEK_OFFSETS_DAYS = [19, 13, 7, 1] as const;

/** All sample data is dated from this moment (10:30 India time, 16 November). */
export const SAMPLE_NOW = new Date("2026-11-16T05:00:00.000Z");

// ---------- Consent ----------

export type ConsentKey = "core" | "careTeam" | "analytics";

export const CONSENT_COPY: Record<ConsentKey, { title: string; body: string }> = {
  core: en.privacy.scopes.CORE_PROCESSING,
  careTeam: en.privacy.scopes.CARE_TEAM_REVIEW,
  analytics: {
    title: en.privacy.scopes.AGGREGATE_ANALYTICS.title,
    body: en.privacy.scopes.AGGREGATE_ANALYTICS.body.replace("{k}", "5"),
  },
};

export const CORE_REQUIRED = en.privacy.coreRequired;
export const CONSENT_SAFETY_NOTE = en.privacy.safetyNote;
export const NO_AI_NOTE = en.privacy.aiNote;

// ---------- Crisis contacts ----------

// services/config.ts imports the database layer only as a type, so this stays browser-safe and the
// numbers have one source.
export { NATIONAL_CRISIS_CONTACTS as CRISIS_CONTACTS } from "@/lib/services/config";

// ---------- Review wording (restated from services/alerts.ts) ----------

export const DECISION_KEYS: readonly AlertDecision[] = ["NO_ACTION_NEEDED", "OUTREACH", "FURTHER_ASSESSMENT", "REFERRAL", "CRISIS_PROTOCOL"];

export const DECISION_LABEL: Record<AlertDecision, string> = {
  NO_ACTION_NEEDED: "No action needed",
  OUTREACH: "Reach out to the student",
  FURTHER_ASSESSMENT: "Request further assessment",
  REFERRAL: "Refer to a professional",
  CRISIS_PROTOCOL: "Follow the crisis protocol",
};

export const FEEDBACK_KEYS: readonly ReviewerFeedback[] = ["APPROPRIATE", "NOT_NEEDED", "UNDER_TRIAGED"];

export const FEEDBACK_LABEL: Record<ReviewerFeedback, string> = {
  APPROPRIATE: "The alert was appropriate",
  NOT_NEEDED: "The alert was not needed",
  UNDER_TRIAGED: "The category was too low",
};

export const ATTEMPT_OUTCOMES = ["REACHED", "NO_ANSWER", "LEFT_MESSAGE"] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export const ATTEMPT_OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  REACHED: "Reached the person",
  NO_ANSWER: "No answer",
  LEFT_MESSAGE: "Left a message",
};

/** Default acknowledgement windows. */
export const ACK_WINDOW: Record<Exclude<TriageCategory, "ROUTINE">, { ms: number; label: string }> = {
  URGENT: { ms: 15 * 60_000, label: "15 minutes" },
  PRIORITY: { ms: 24 * 3_600_000, label: "24 hours" },
  MONITOR: { ms: 72 * 3_600_000, label: "72 hours" },
};

// ---------- Case lifecycle (wording from components/care/lifecycle-rail.tsx) ----------

export const MILESTONES = [
  "received",
  "acknowledged",
  "reviewed",
  "contacted",
  "arranged",
  "referred",
  "appointment",
  "followUp",
  "outcome",
  "ended",
] as const;
export type Milestone = (typeof MILESTONES)[number];

export const MILESTONE_LABEL: Record<Milestone, string> = {
  received: "Request or alert received",
  acknowledged: "Acknowledged",
  reviewed: "Human review",
  contacted: "Student contacted",
  arranged: "Assessment or consultation arranged",
  referred: "Referral initiated",
  appointment: "Appointment completed or updated",
  followUp: "Follow-up scheduled",
  outcome: "Outcome documented",
  ended: "Closed or returned to monitoring",
};

// ---------- Presets ----------

export type PresetId = "steady" | "exam" | "sudden" | "urgent";

type Series = readonly [number, number, number, number];
export type Preset = {
  id: PresetId;
  label: string;
  description: string;
  weeks: Record<ScaleKey, Series>;
  phq: readonly number[];
  urgentHelp: boolean;
};

export const PRESETS: readonly Preset[] = [
  {
    id: "steady",
    label: "Steady",
    description: "Four ordinary weeks. Nothing stands out.",
    weeks: {
      mood: [4, 4, 4, 4],
      stress: [2, 2, 2, 2],
      sleep: [4, 3, 4, 4],
      energy: [4, 3, 4, 4],
      social: [4, 4, 4, 4],
      academicPressure: [2, 2, 3, 2],
    },
    phq: [0, 1, 0, 0, 0, 0, 0, 0, 0],
    urgentHelp: false,
  },
  {
    id: "exam",
    label: "Exam pressure building",
    description: "Stress and pressure climb, sleep and mood slip.",
    weeks: {
      mood: [3, 2, 2, 2],
      stress: [3, 4, 4, 5],
      sleep: [3, 2, 2, 2],
      energy: [3, 3, 2, 2],
      social: [3, 3, 2, 2],
      academicPressure: [4, 4, 5, 5],
    },
    phq: [1, 2, 2, 1, 1, 1, 1, 1, 0],
    urgentHelp: false,
  },
  {
    id: "sudden",
    label: "Sudden low week",
    description: "Three steady weeks, then a sharp drop in the last one.",
    weeks: {
      mood: [4, 4, 4, 1],
      stress: [2, 2, 2, 5],
      sleep: [4, 4, 3, 1],
      energy: [4, 4, 4, 1],
      social: [4, 4, 4, 2],
      academicPressure: [2, 2, 3, 4],
    },
    phq: [2, 3, 2, 3, 2, 2, 2, 2, 0],
    urgentHelp: false,
  },
  {
    id: "urgent",
    label: "Asks for urgent help",
    description: "A difficult month, a positive answer to PHQ-9 question 9, and an urgent request.",
    weeks: {
      mood: [3, 3, 2, 1],
      stress: [3, 3, 4, 5],
      sleep: [3, 2, 2, 1],
      energy: [3, 2, 2, 1],
      social: [3, 3, 2, 1],
      academicPressure: [3, 4, 4, 5],
    },
    phq: [2, 3, 2, 2, 2, 3, 2, 1, 1],
    urgentHelp: true,
  },
];

export function presetById(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}

// ---------- Sample cohort for the leaders view ----------

export const STUDENT_DEPARTMENT = "Physics";

export const SAMPLE_COHORT: readonly { key: string; n: number; meanMood: number }[] = [
  { key: "Computer science", n: 41, meanMood: 3.4 },
  { key: "Mechanical engineering", n: 26, meanMood: 3.6 },
  { key: "Civil engineering", n: 15, meanMood: 3.2 },
  { key: "Physics", n: 7, meanMood: 3.5 },
  { key: "Humanities", n: 6, meanMood: 3.8 },
  { key: "Design", n: 3, meanMood: 3.1 },
];

export const MIN_GROUP_RANGE = { min: 5, max: 15 } as const;
