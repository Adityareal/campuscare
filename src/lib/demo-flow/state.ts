import type { AlertDecision, ReviewerFeedback, TriageCategory } from "@prisma/client";
import { en } from "@/lib/i18n/en";
import {
  CORE_REQUIRED,
  MILESTONES,
  MIN_GROUP_RANGE,
  presetById,
  SAMPLE_NOW,
  SCALE_KEYS,
  STAGES,
  stageIndex,
  WEEK_COUNT,
  type AttemptOutcome,
  type ConsentKey,
  type Milestone,
  type PresetId,
  type ScaleKey,
  type StageId,
} from "@/lib/demo-flow/content";
import { emptyPhq, emptyWeek, evaluateStudent, type Answer, type Evaluation, type WeekAnswers } from "@/lib/demo-flow/evaluate";

/**
 * The state machine behind /try. Pure: no timers, no DOM, no network. Each refusal below uses the
 * wording of the real service that enforces the same rule, so the walk teaches the real behaviour.
 */

export type Scope = "stage" | "input" | "review" | "attempt" | "booking" | "followUp" | "outcome" | "closeAlert" | "closeCase";

export type ConsentState = Record<ConsentKey, boolean>;

export type ReviewState = {
  decision: AlertDecision | null;
  feedback: ReviewerFeedback | null;
  note: string;
  recorded: boolean;
  /** The crisis protocol was chosen on an alert that was not yet urgent, which makes it urgent. */
  escalated: boolean;
  attempts: { outcome: AttemptOutcome; at: number }[];
};

export type CareState = {
  /** Minutes since the alert was raised in the simulation. Advances with each recorded action. */
  clock: number;
  stamps: Partial<Record<Milestone, number>>;
  booked: boolean;
  attendance: "attended" | "missed" | null;
  sessions: number;
  followUpsPending: number;
  followUpsDone: number;
  outcome: string;
  alertClosed: boolean;
  caseClosed: boolean;
};

export type DemoState = {
  stage: StageId;
  /** Furthest stage index the visitor may jump to. */
  reached: number;
  consent: ConsentState;
  weeks: WeekAnswers[];
  phq: Answer[];
  urgentHelp: boolean;
  preset: PresetId | null;
  rulesRun: boolean;
  review: ReviewState;
  care: CareState;
  minGroup: number;
  errors: Partial<Record<Scope, string>>;
};

export function emptyReview(): ReviewState {
  return { decision: null, feedback: null, note: "", recorded: false, escalated: false, attempts: [] };
}

export function emptyCare(): CareState {
  return {
    clock: 0,
    stamps: {},
    booked: false,
    attendance: null,
    sessions: 0,
    followUpsPending: 0,
    followUpsDone: 0,
    outcome: "",
    alertClosed: false,
    caseClosed: false,
  };
}

function blankState(): DemoState {
  return {
    stage: "student",
    reached: 0,
    // The simulation starts with every scope on so the rules have something to read. The panel
    // says that the real app switches on only core processing until the student chooses.
    consent: { core: true, careTeam: true, analytics: true },
    weeks: Array.from({ length: WEEK_COUNT }, emptyWeek),
    phq: emptyPhq(),
    urgentHelp: false,
    preset: null,
    rulesRun: false,
    review: emptyReview(),
    care: emptyCare(),
    minGroup: MIN_GROUP_RANGE.min,
    errors: {},
  };
}

export type Action =
  | { type: "goto"; stage: StageId }
  | { type: "next" }
  | { type: "back" }
  | { type: "reset" }
  | { type: "setConsent"; key: ConsentKey; value: boolean }
  | { type: "setAnswer"; week: number; key: ScaleKey; value: Answer }
  | { type: "setPhq"; index: number; value: Answer }
  | { type: "clearPhq" }
  | { type: "setUrgentHelp"; value: boolean }
  | { type: "preset"; id: PresetId }
  | { type: "rulesRan" }
  | { type: "setDecision"; value: AlertDecision }
  | { type: "setFeedback"; value: ReviewerFeedback | null }
  | { type: "setNote"; value: string }
  | { type: "submitReview" }
  | { type: "recordAttempt"; outcome: AttemptOutcome }
  | { type: "recordContact" }
  | { type: "bookSession" }
  | { type: "markAttended" }
  | { type: "markMissed" }
  | { type: "scheduleFollowUp" }
  | { type: "completeFollowUp" }
  | { type: "documentOutcome"; text: string }
  | { type: "closeAlert" }
  | { type: "closeCase" }
  | { type: "setMinGroup"; value: number };

// ---------- Selectors ----------

export function evaluationFor(s: Pick<DemoState, "consent" | "weeks" | "phq" | "urgentHelp">): Evaluation {
  return evaluateStudent({
    includePatterns: s.consent.core && s.consent.careTeam,
    weeks: s.weeks,
    phq: s.phq,
    urgentHelp: s.urgentHelp,
  });
}

export function effectiveCategory(s: Pick<DemoState, "review">, ev: Evaluation): TriageCategory {
  if (!ev.alertRaised) return "ROUTINE";
  return s.review.escalated ? "URGENT" : ev.category;
}

export function caseIsOpen(s: Pick<DemoState, "review">, ev: Evaluation): boolean {
  return ev.alertRaised && s.review.recorded && s.review.decision !== null && s.review.decision !== "NO_ACTION_NEEDED";
}

export function needsReviewNote(category: TriageCategory, decision: AlertDecision | null): boolean {
  return category === "URGENT" || (decision === "NO_ACTION_NEEDED" && category === "PRIORITY");
}

export type Consequence = {
  caseOpened: boolean;
  questionnaireRequested: boolean;
  referralCreated: boolean;
  crisisProtocol: boolean;
  lines: string[];
};

export function consequenceFor(decision: AlertDecision, category: TriageCategory): Consequence {
  switch (decision) {
    case "NO_ACTION_NEEDED":
      return {
        caseOpened: false,
        questionnaireRequested: false,
        referralCreated: false,
        crisisProtocol: false,
        lines: [
          "No case is opened.",
          category === "PRIORITY" || category === "URGENT"
            ? "A written note is required, because a human is choosing not to act on a raised concern."
            : "The alert can be closed once the review is recorded.",
        ],
      };
    case "OUTREACH":
      return {
        caseOpened: true,
        questionnaireRequested: false,
        referralCreated: false,
        crisisProtocol: false,
        lines: ["A case is opened and linked to this alert.", "A person contacts the student through an authorised channel."],
      };
    case "FURTHER_ASSESSMENT":
      return {
        caseOpened: true,
        questionnaireRequested: true,
        referralCreated: false,
        crisisProtocol: false,
        lines: ["A case is opened and linked to this alert.", "A PHQ-9 or GAD-7 questionnaire is requested from the student."],
      };
    case "REFERRAL":
      return {
        caseOpened: true,
        questionnaireRequested: false,
        referralCreated: true,
        crisisProtocol: false,
        lines: ["A case is opened and linked to this alert.", "A referral is created, and the student can book with a verified professional."],
      };
    case "CRISIS_PROTOCOL":
      return {
        caseOpened: true,
        questionnaireRequested: false,
        referralCreated: false,
        crisisProtocol: true,
        lines: [
          category === "URGENT" ? "The alert is already urgent." : "The alert is raised to urgent.",
          "A case is opened and the on-call responder is notified.",
          "Every contact attempt is recorded. An urgent alert cannot close until at least one attempt is on record.",
        ],
      };
  }
}

/** Minutes after the alert was raised at which each lifecycle step first happened, or null. */
export function milestoneDates(s: Pick<DemoState, "care" | "review">, ev: Evaluation): Record<Milestone, Date | null> {
  const open = caseIsOpen(s, ev);
  const at = (m: Milestone): Date | null => {
    const minutes = s.care.stamps[m];
    return open && minutes !== undefined ? new Date(SAMPLE_NOW.getTime() + minutes * 60_000) : null;
  };
  return Object.fromEntries(MILESTONES.map((m) => [m, at(m)])) as Record<Milestone, Date | null>;
}

// ---------- Reducer ----------

const STEP_MINUTES = 35;

function clean(state: DemoState): DemoState {
  return Object.keys(state.errors).length ? { ...state, errors: {} } : state;
}

function refuse(state: DemoState, scope: Scope, message: string): DemoState {
  return { ...state, errors: { [scope]: message } };
}

/** Changing what the student entered makes every later stage out of date. */
function inputsChanged(state: DemoState, patch: Partial<DemoState>): DemoState {
  return { ...state, ...patch, rulesRun: false, review: emptyReview(), care: emptyCare(), reached: 0, errors: {} };
}

function advanceClock(care: CareState): CareState {
  return { ...care, clock: care.clock + STEP_MINUTES };
}

function withStamp(care: CareState, m: Milestone): CareState {
  return care.stamps[m] === undefined ? { ...care, stamps: { ...care.stamps, [m]: care.clock } } : care;
}

function setSeries(preset: PresetId): WeekAnswers[] {
  const p = presetById(preset);
  return Array.from({ length: WEEK_COUNT }, (_, i) => {
    const w = emptyWeek();
    for (const k of SCALE_KEYS) w[k] = p.weeks[k][i] ?? null;
    return w;
  });
}

export function demoReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "reset":
      return blankState();

    case "goto": {
      const idx = stageIndex(action.stage);
      return idx <= state.reached ? { ...clean(state), stage: action.stage } : state;
    }

    case "back": {
      const idx = stageIndex(state.stage);
      return idx > 0 ? { ...clean(state), stage: STAGES[idx - 1]!.id } : state;
    }

    case "next": {
      const idx = stageIndex(state.stage);
      if (idx >= STAGES.length - 1) return state;
      const ev = evaluationFor(state);
      if (state.stage === "student" && !state.consent.core) return refuse(state, "stage", CORE_REQUIRED);
      if (state.stage === "rules" && !state.rulesRun) return refuse(state, "stage", "Let the rules finish first, or choose Show all.");
      if (state.stage === "decision" && ev.alertRaised && !state.review.recorded) {
        return refuse(state, "stage", "Record a review decision before moving on.");
      }
      return { ...clean(state), stage: STAGES[idx + 1]!.id, reached: Math.max(state.reached, idx + 1) };
    }

    case "setConsent": {
      if (action.key !== "core" && action.value && !state.consent.core) return refuse(state, "input", CORE_REQUIRED);
      const consent: ConsentState = { ...state.consent, [action.key]: action.value };
      if (action.key === "core" && !action.value) {
        consent.careTeam = false;
        consent.analytics = false;
      }
      // Anonymous statistics never change what the rules see, so later stages stay valid.
      if (action.key === "analytics") return { ...clean(state), consent };
      return inputsChanged(state, { consent });
    }

    case "preset": {
      if (!state.consent.core) return refuse(state, "input", en.checkIn.consentNeeded);
      const p = presetById(action.id);
      return inputsChanged(state, { weeks: setSeries(action.id), phq: [...p.phq], urgentHelp: p.urgentHelp, preset: action.id });
    }

    case "setAnswer": {
      if (!state.consent.core) return refuse(state, "input", en.checkIn.consentNeeded);
      if (action.week < 0 || action.week >= WEEK_COUNT) return state;
      if (action.value !== null && (!Number.isInteger(action.value) || action.value < 1 || action.value > 5)) return state;
      const weeks = state.weeks.map((w, i) => (i === action.week ? { ...w, [action.key]: action.value } : w));
      return inputsChanged(state, { weeks, preset: null });
    }

    case "setPhq": {
      if (!state.consent.core) return refuse(state, "input", en.checkIn.consentNeeded);
      if (action.index < 0 || action.index >= state.phq.length) return state;
      if (action.value !== null && (!Number.isInteger(action.value) || action.value < 0 || action.value > 3)) return state;
      const phq = state.phq.map((a, i) => (i === action.index ? action.value : a));
      return inputsChanged(state, { phq, preset: null });
    }

    case "clearPhq":
      return inputsChanged(state, { phq: emptyPhq(), preset: null });

    case "setUrgentHelp":
      if (!state.consent.core) return refuse(state, "input", en.checkIn.consentNeeded);
      return inputsChanged(state, { urgentHelp: action.value, preset: null });

    case "rulesRan":
      return state.rulesRun ? state : { ...state, rulesRun: true };

    case "setDecision":
      return state.review.recorded ? state : { ...clean(state), review: { ...state.review, decision: action.value } };

    case "setFeedback":
      return state.review.recorded ? state : { ...clean(state), review: { ...state.review, feedback: action.value } };

    case "setNote":
      return state.review.recorded ? state : { ...clean(state), review: { ...state.review, note: action.value } };

    case "submitReview": {
      const ev = evaluationFor(state);
      if (!ev.alertRaised) return refuse(state, "review", "There is no alert to review.");
      if (state.review.recorded) return refuse(state, "review", "This alert has already been reviewed.");
      const decision = state.review.decision;
      if (!decision) return refuse(state, "review", "Choose a decision.");
      const note = state.review.note.trim();
      if (needsReviewNote(ev.category, decision) && note.length < 10) {
        return refuse(state, "review", "Explain the decision in a sentence or two. It is required for this alert.");
      }
      let care = advanceClock({ ...state.care, stamps: { ...state.care.stamps, received: 0 } });
      care = withStamp(withStamp(care, "acknowledged"), "reviewed");
      if (decision === "REFERRAL") care = withStamp(care, "referred");
      return {
        ...clean(state),
        review: { ...state.review, note, recorded: true, escalated: decision === "CRISIS_PROTOCOL" && ev.category !== "URGENT" },
        care,
      };
    }

    case "recordAttempt": {
      const ev = evaluationFor(state);
      if (effectiveCategory(state, ev) !== "URGENT") return refuse(state, "attempt", "Contact attempts are recorded on urgent alerts.");
      if (state.care.alertClosed) return refuse(state, "attempt", "This alert is closed.");
      let care = advanceClock(state.care);
      if (action.outcome === "REACHED" && caseIsOpen(state, ev)) care = withStamp(care, "contacted");
      return { ...clean(state), review: { ...state.review, attempts: [...state.review.attempts, { outcome: action.outcome, at: care.clock }] }, care };
    }

    case "recordContact": {
      const ev = evaluationFor(state);
      if (!caseIsOpen(state, ev)) return state;
      if (state.care.caseClosed) return refuse(state, "booking", "Reopen the case before recording new actions.");
      return { ...clean(state), care: withStamp(advanceClock(state.care), "contacted") };
    }

    case "bookSession": {
      const ev = evaluationFor(state);
      if (!caseIsOpen(state, ev)) return state;
      if (state.care.caseClosed) return refuse(state, "booking", "Reopen the case before recording new actions.");
      if (state.care.booked && state.care.attendance === null) return refuse(state, "booking", "A session is already booked.");
      if (state.care.attendance === "attended") return refuse(state, "booking", "The session has already taken place.");
      const care = withStamp(withStamp(advanceClock(state.care), "arranged"), "referred");
      return { ...clean(state), care: { ...care, booked: true, attendance: null, sessions: care.sessions + 1 } };
    }

    case "markAttended":
    case "markMissed": {
      const ev = evaluationFor(state);
      if (!caseIsOpen(state, ev)) return state;
      if (state.care.caseClosed) return refuse(state, "booking", "Reopen the case before recording new actions.");
      if (!state.care.booked || state.care.attendance !== null) return refuse(state, "booking", "Book a session first.");
      const care = withStamp(advanceClock(state.care), "appointment");
      return { ...clean(state), care: { ...care, attendance: action.type === "markAttended" ? "attended" : "missed" } };
    }

    case "scheduleFollowUp": {
      const ev = evaluationFor(state);
      if (!caseIsOpen(state, ev)) return state;
      if (state.care.caseClosed) return refuse(state, "followUp", "Reopen the case before recording new actions.");
      const care = withStamp(advanceClock(state.care), "followUp");
      return { ...clean(state), care: { ...care, followUpsPending: care.followUpsPending + 1 } };
    }

    case "completeFollowUp": {
      if (state.care.followUpsPending < 1) return refuse(state, "followUp", "There is no scheduled follow-up to complete.");
      const care = advanceClock(state.care);
      return { ...clean(state), care: { ...care, followUpsPending: care.followUpsPending - 1, followUpsDone: care.followUpsDone + 1 } };
    }

    case "documentOutcome": {
      const ev = evaluationFor(state);
      if (!caseIsOpen(state, ev)) return state;
      if (state.care.caseClosed) return refuse(state, "outcome", "This case is closed.");
      const text = action.text.trim();
      if (text.length < 10) return refuse(state, "outcome", "Describe the outcome in at least a sentence.");
      const care = withStamp(advanceClock(state.care), "outcome");
      return { ...clean(state), care: { ...care, outcome: text } };
    }

    case "closeAlert": {
      const ev = evaluationFor(state);
      if (!ev.alertRaised) return state;
      if (state.care.alertClosed) return refuse(state, "closeAlert", "This alert is already closed.");
      if (!state.review.recorded) return refuse(state, "closeAlert", "Record a review decision before closing the alert.");
      if (effectiveCategory(state, ev) === "URGENT") {
        if (state.review.attempts.length === 0) {
          return refuse(state, "closeAlert", "Record at least one contact or escalation attempt before closing an urgent alert.");
        }
        if (!state.review.note.trim()) return refuse(state, "closeAlert", "Urgent alerts need a written review note before closing.");
      }
      return { ...clean(state), care: { ...advanceClock(state.care), alertClosed: true } };
    }

    case "closeCase": {
      const ev = evaluationFor(state);
      if (!caseIsOpen(state, ev)) return state;
      if (state.care.caseClosed) return refuse(state, "closeCase", "This case is already closed.");
      if (!state.care.stamps.outcome) return refuse(state, "closeCase", "Document the outcome before closing the case.");
      if (!state.care.alertClosed) return refuse(state, "closeCase", "Review and close the 1 linked alert(s) first.");
      if (state.care.followUpsPending > 0) {
        return refuse(state, "closeCase", `Complete or cancel the ${state.care.followUpsPending} scheduled follow-up(s) first.`);
      }
      const care = withStamp(advanceClock(state.care), "ended");
      return { ...clean(state), care: { ...care, caseClosed: true } };
    }

    case "setMinGroup": {
      const value = Math.min(MIN_GROUP_RANGE.max, Math.max(MIN_GROUP_RANGE.min, Math.round(action.value)));
      return { ...state, minGroup: value };
    }
  }
}

/**
 * A walk that starts on a later stage (a shared link, a reload) is seeded with a sample student
 * so every stage has something to show. Stage one always starts empty.
 */
export function initialState(stage: StageId = "student"): DemoState {
  let s = blankState();
  const target = stageIndex(stage);
  if (target <= 0) return s;
  s = demoReducer(s, { type: "setConsent", key: "core", value: true });
  s = demoReducer(s, { type: "setConsent", key: "careTeam", value: true });
  s = demoReducer(s, { type: "setConsent", key: "analytics", value: true });
  s = demoReducer(s, { type: "preset", id: "exam" });
  s = demoReducer(s, { type: "rulesRan" });
  if (target >= stageIndex("care")) {
    s = demoReducer(s, { type: "setDecision", value: "OUTREACH" });
    s = demoReducer(s, { type: "setNote", value: "Sample note: reach out to the student this week." });
    s = demoReducer(s, { type: "submitReview" });
  }
  return { ...s, stage, reached: target };
}
