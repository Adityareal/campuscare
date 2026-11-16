import { describe, expect, it } from "vitest";
import { cohortView } from "@/lib/demo-flow/cohort";
import { CORE_REQUIRED, presetById, PRESETS, SAMPLE_COHORT, STAGES } from "@/lib/demo-flow/content";
import { evaluateStudent, phqSummary } from "@/lib/demo-flow/evaluate";
import { nextEnabledIndex } from "@/lib/demo-flow/keys";
import {
  caseIsOpen,
  consequenceFor,
  demoReducer,
  effectiveCategory,
  evaluationFor,
  initialState,
  type Action,
  type DemoState,
} from "@/lib/demo-flow/state";

const run = (s: DemoState, ...actions: Action[]) => actions.reduce(demoReducer, s);

const consented = (...extra: Action[]) =>
  run(
    initialState(),
    { type: "setConsent", key: "core", value: true },
    { type: "setConsent", key: "careTeam", value: true },
    { type: "setConsent", key: "analytics", value: true },
    ...extra,
  );

const toDecision = (preset: Parameters<typeof presetById>[0]) =>
  run(consented({ type: "preset", id: preset }), { type: "next" }, { type: "rulesRan" }, { type: "next" });

describe("stage transitions", () => {
  it("starts on the first stage with nothing reached beyond it", () => {
    const s = initialState();
    expect(s.stage).toBe("student");
    expect(s.reached).toBe(0);
    expect(STAGES.map((x) => x.id)).toEqual(["student", "rules", "decision", "care", "leaders"]);
  });

  it("moves forward and back through the stages", () => {
    let s = consented({ type: "preset", id: "exam" });
    s = run(s, { type: "next" });
    expect(s.stage).toBe("rules");
    s = run(s, { type: "back" });
    expect(s.stage).toBe("student");
  });

  it("blocks Next on the rules stage until the log has finished", () => {
    let s = run(consented({ type: "preset", id: "exam" }), { type: "next" }, { type: "next" });
    expect(s.stage).toBe("rules");
    expect(s.errors.stage).toMatch(/rules finish/);
    s = run(s, { type: "rulesRan" }, { type: "next" });
    expect(s.stage).toBe("decision");
  });

  it("only jumps to stages that were reached", () => {
    let s = consented({ type: "preset", id: "exam" });
    expect(run(s, { type: "goto", stage: "care" }).stage).toBe("student");
    s = run(s, { type: "next" });
    expect(run(s, { type: "goto", stage: "student" }).stage).toBe("student");
    expect(run(s, { type: "goto", stage: "rules" }).stage).toBe("rules");
  });

  it("seeds a sample student when linked to a later stage", () => {
    const s = initialState("care");
    expect(s.stage).toBe("care");
    expect(s.reached).toBe(3);
    expect(s.review.recorded).toBe(true);
    expect(caseIsOpen(s, evaluationFor(s))).toBe(true);
    expect(initialState("leaders").stage).toBe("leaders");
    expect(initialState("decision").review.recorded).toBe(false);
  });

  it("resets everything", () => {
    const s = run(initialState("care"), { type: "reset" });
    expect(s.stage).toBe("student");
    expect(s.consent).toEqual({ core: true, careTeam: true, analytics: true });
    expect(s.review.recorded).toBe(false);
  });

  it("makes later stages out of date when the student's answers change", () => {
    let s = initialState("care");
    s = run(s, { type: "goto", stage: "student" }, { type: "setAnswer", week: 3, key: "mood", value: 5 });
    expect(s.rulesRun).toBe(false);
    expect(s.review.recorded).toBe(false);
    expect(s.reached).toBe(0);
  });

  it("keeps later stages when only the statistics consent changes", () => {
    const s = run(initialState("care"), { type: "setConsent", key: "analytics", value: false });
    expect(s.review.recorded).toBe(true);
    expect(s.reached).toBe(3);
  });
});

describe("consent gating", () => {
  const withoutCore = () => run(initialState(), { type: "setConsent", key: "core", value: false });

  it("starts with every scope on, so the rules have something to read", () => {
    expect(initialState().consent).toEqual({ core: true, careTeam: true, analytics: true });
  });

  it("refuses to continue, and to take answers, without core consent", () => {
    let s = withoutCore();
    expect(s.consent).toEqual({ core: false, careTeam: false, analytics: false });
    s = run(s, { type: "next" });
    expect(s.stage).toBe("student");
    expect(s.errors.stage).toBe(CORE_REQUIRED);
    s = run(withoutCore(), { type: "setAnswer", week: 0, key: "mood", value: 3 });
    expect(s.weeks[0]?.mood).toBeNull();
    expect(s.errors.input).toBeTruthy();
    s = run(withoutCore(), { type: "preset", id: "steady" });
    expect(s.preset).toBeNull();
  });

  it("does not allow the other scopes while core consent is off", () => {
    const s = run(withoutCore(), { type: "setConsent", key: "careTeam", value: true });
    expect(s.consent.careTeam).toBe(false);
    expect(s.errors.input).toBe(CORE_REQUIRED);
  });

  it("switching core consent off switches the others off", () => {
    const s = run(consented(), { type: "setConsent", key: "core", value: false });
    expect(s.consent).toEqual({ core: false, careTeam: false, analytics: false });
  });

  it("does not evaluate patterns without care-team review consent", () => {
    const withReview = consented({ type: "preset", id: "exam" });
    const without = run(withReview, { type: "setConsent", key: "careTeam", value: false });
    expect(evaluationFor(withReview).alertRaised).toBe(true);
    const ev = evaluationFor(without);
    expect(ev.includePatterns).toBe(false);
    expect(ev.alertRaised).toBe(false);
    expect(ev.log.some((l) => l.status === "skipped")).toBe(true);
  });

  it("still raises an alert for an explicit urgent request when review is off", () => {
    const s = run(consented({ type: "preset", id: "urgent" }), { type: "setConsent", key: "careTeam", value: false });
    const ev = evaluationFor(s);
    expect(ev.alertRaised).toBe(true);
    expect(ev.category).toBe("URGENT");
    expect(ev.findings.map((f) => f.ruleCode)).toEqual(["URGENT_HELP_REQUEST"]);
  });
});

describe("the real rules on the presets", () => {
  const category = (id: (typeof PRESETS)[number]["id"]) => evaluationFor(consented({ type: "preset", id })).category;

  it("raises no alert for a steady student", () => {
    const ev = evaluationFor(consented({ type: "preset", id: "steady" }));
    expect(ev.alertRaised).toBe(false);
    expect(ev.category).toBe("ROUTINE");
    expect(ev.title).toBeNull();
  });

  it("combines independent sources into a priority alert", () => {
    const ev = evaluationFor(consented({ type: "preset", id: "exam" }));
    expect(ev.category).toBe("PRIORITY");
    expect(ev.findings.map((f) => f.ruleCode)).toContain("COMBINED_PATTERNS");
    expect(ev.title).toMatch(/^Priority review: /);
  });

  it("raises a priority alert from a high PHQ-9 alone", () => {
    expect(category("sudden")).toBe("PRIORITY");
    const ev = evaluationFor(consented({ type: "preset", id: "sudden" }));
    expect(ev.findings.map((f) => f.ruleCode)).toEqual(["PHQ9_SEVERITY"]);
    expect(phqSummary(ev.phqScore)).toMatch(/18 of 27/);
  });

  it("raises an urgent alert and the safety screen for question 9", () => {
    const ev = evaluationFor(consented({ type: "preset", id: "urgent" }));
    expect(category("urgent")).toBe("URGENT");
    expect(ev.safetyScreen).toBe(true);
    expect(ev.findings.map((f) => f.ruleCode)).toEqual(expect.arrayContaining(["PHQ9_SAFETY_ITEM", "URGENT_HELP_REQUEST"]));
  });

  it("shows the safety screen even when the PHQ-9 is incomplete, but does not score it", () => {
    const s = consented({ type: "setPhq", index: 8, value: 2 });
    const ev = evaluationFor(s);
    expect(ev.safetyScreen).toBe(true);
    expect(ev.phqScore).toBeNull();
    expect(ev.alertRaised).toBe(false);
  });

  it("writes one log line per written rule plus a consent line and a plan line", () => {
    const ev = evaluateStudent({ includePatterns: true, weeks: initialState().weeks, phq: initialState().phq, urgentHelp: false });
    expect(ev.log).toHaveLength(14 + 2);
    expect(ev.log.at(-1)?.at).toBe(1);
    expect(ev.log.map((l) => l.at)).toEqual([...ev.log.map((l) => l.at)].sort((a, b) => a - b));
  });

  it("is safe to evaluate when every answer is skipped", () => {
    const ev = evaluationFor(consented());
    expect(ev.submittedWeeks).toBe(0);
    expect(ev.alertRaised).toBe(false);
  });
});

describe("the review decision", () => {
  it("requires a decision", () => {
    const s = run(toDecision("exam"), { type: "submitReview" });
    expect(s.errors.review).toBe("Choose a decision.");
    expect(s.review.recorded).toBe(false);
  });

  it("blocks Next until an alert is reviewed", () => {
    const s = run(toDecision("exam"), { type: "next" });
    expect(s.stage).toBe("decision");
    expect(s.errors.stage).toMatch(/review decision/);
  });

  it("lets a student with no alert move on", () => {
    const s = run(toDecision("steady"), { type: "next" });
    expect(s.stage).toBe("care");
    expect(caseIsOpen(s, evaluationFor(s))).toBe(false);
  });

  it("requires a written note for an urgent alert", () => {
    let s = run(toDecision("urgent"), { type: "setDecision", value: "OUTREACH" }, { type: "submitReview" });
    expect(s.errors.review).toMatch(/required for this alert/);
    s = run(s, { type: "setNote", value: "short" }, { type: "submitReview" });
    expect(s.review.recorded).toBe(false);
    s = run(s, { type: "setNote", value: "Calling the student now." }, { type: "submitReview" });
    expect(s.review.recorded).toBe(true);
  });

  it("requires a note when choosing no action on a priority alert, but not on a monitor alert", () => {
    let s = run(toDecision("exam"), { type: "setDecision", value: "NO_ACTION_NEEDED" }, { type: "submitReview" });
    expect(s.errors.review).toMatch(/required/);
    s = run(s, { type: "setNote", value: "Reviewed with the student last week." }, { type: "submitReview" });
    expect(s.review.recorded).toBe(true);
    expect(caseIsOpen(s, evaluationFor(s))).toBe(false);
    expect(consequenceFor("NO_ACTION_NEEDED", "MONITOR").lines.join(" ")).not.toMatch(/required/);
  });

  it("does not need a note for outreach on a priority alert", () => {
    const s = run(toDecision("exam"), { type: "setDecision", value: "OUTREACH" }, { type: "submitReview" });
    expect(s.review.recorded).toBe(true);
    expect(caseIsOpen(s, evaluationFor(s))).toBe(true);
  });

  it("maps each decision to its consequence", () => {
    expect(consequenceFor("NO_ACTION_NEEDED", "MONITOR").caseOpened).toBe(false);
    expect(consequenceFor("OUTREACH", "MONITOR").caseOpened).toBe(true);
    expect(consequenceFor("FURTHER_ASSESSMENT", "MONITOR").questionnaireRequested).toBe(true);
    expect(consequenceFor("REFERRAL", "MONITOR").referralCreated).toBe(true);
    expect(consequenceFor("CRISIS_PROTOCOL", "MONITOR").crisisProtocol).toBe(true);
  });

  it("makes the crisis protocol raise a non-urgent alert to urgent", () => {
    const s = run(toDecision("exam"), { type: "setDecision", value: "CRISIS_PROTOCOL" }, { type: "submitReview" });
    expect(s.review.escalated).toBe(true);
    expect(effectiveCategory(s, evaluationFor(s))).toBe("URGENT");
  });

  it("locks the review once it is recorded", () => {
    let s = run(toDecision("exam"), { type: "setDecision", value: "OUTREACH" }, { type: "submitReview" });
    s = run(s, { type: "setDecision", value: "REFERRAL" });
    expect(s.review.decision).toBe("OUTREACH");
    s = run(s, { type: "submitReview" });
    expect(s.errors.review).toMatch(/already been reviewed/);
  });
});

describe("closing refusals", () => {
  const reviewed = (decision: Action & { type: "setDecision" }, preset: Parameters<typeof presetById>[0] = "exam") =>
    run(toDecision(preset), decision, { type: "setNote", value: "Reviewed and agreed a plan." }, { type: "submitReview" }, { type: "next" });

  it("refuses to close an alert before a review is recorded", () => {
    const s = run(toDecision("exam"), { type: "closeAlert" });
    expect(s.errors.closeAlert).toBe("Record a review decision before closing the alert.");
  });

  it("refuses to close an urgent alert without a contact attempt, then allows it after one", () => {
    let s = run(reviewed({ type: "setDecision", value: "CRISIS_PROTOCOL" }), { type: "closeAlert" });
    expect(s.errors.closeAlert).toBe("Record at least one contact or escalation attempt before closing an urgent alert.");
    s = run(s, { type: "recordAttempt", outcome: "NO_ANSWER" }, { type: "closeAlert" });
    expect(s.care.alertClosed).toBe(true);
  });

  it("refuses contact attempts on an alert that is not urgent", () => {
    const s = run(reviewed({ type: "setDecision", value: "OUTREACH" }), { type: "recordAttempt", outcome: "REACHED" });
    expect(s.errors.attempt).toBeTruthy();
    expect(s.review.attempts).toHaveLength(0);
  });

  it("refuses to close the case until the outcome is documented, the alert closed and follow-ups done", () => {
    let s = reviewed({ type: "setDecision", value: "OUTREACH" });
    s = run(s, { type: "closeCase" });
    expect(s.errors.closeCase).toBe("Document the outcome before closing the case.");

    s = run(s, { type: "documentOutcome", text: "short" });
    expect(s.errors.outcome).toBe("Describe the outcome in at least a sentence.");
    s = run(s, { type: "documentOutcome", text: "The student agreed to weekly counselling." }, { type: "closeCase" });
    expect(s.errors.closeCase).toBe("Review and close the 1 linked alert(s) first.");

    s = run(s, { type: "closeAlert" }, { type: "scheduleFollowUp" }, { type: "closeCase" });
    expect(s.errors.closeCase).toBe("Complete or cancel the 1 scheduled follow-up(s) first.");

    s = run(s, { type: "completeFollowUp" }, { type: "closeCase" });
    expect(s.care.caseClosed).toBe(true);
    expect(s.care.stamps.ended).toBeDefined();
  });

  it("walks the lifecycle in order and records each first occurrence once", () => {
    let s = reviewed({ type: "setDecision", value: "OUTREACH" });
    s = run(s, { type: "markAttended" });
    expect(s.errors.booking).toBe("Book a session first.");
    s = run(s, { type: "recordContact" }, { type: "bookSession" }, { type: "bookSession" });
    expect(s.errors.booking).toBe("A session is already booked.");
    s = run(s, { type: "markMissed" }, { type: "bookSession" }, { type: "markAttended" });
    expect(s.care.attendance).toBe("attended");
    expect(s.care.sessions).toBe(2);
    const firstAppointment = s.care.stamps.appointment;
    expect(firstAppointment).toBeDefined();
    s = run(s, { type: "bookSession" });
    expect(s.errors.booking).toBe("The session has already taken place.");
    expect(s.care.stamps.appointment).toBe(firstAppointment);
  });

  it("refuses new actions on a closed case", () => {
    let s = reviewed({ type: "setDecision", value: "OUTREACH" });
    s = run(
      s,
      { type: "documentOutcome", text: "The student agreed to weekly counselling." },
      { type: "closeAlert" },
      { type: "closeCase" },
      { type: "bookSession" },
    );
    expect(s.care.caseClosed).toBe(true);
    expect(s.errors.booking).toBe("Reopen the case before recording new actions.");
  });

  it("lets a no-action alert close without a case", () => {
    const s = run(toDecision("exam"), { type: "setDecision", value: "NO_ACTION_NEEDED" }, { type: "setNote", value: "Already supported by a tutor." }, { type: "submitReview" }, { type: "closeAlert" });
    expect(s.care.alertClosed).toBe(true);
    expect(caseIsOpen(s, evaluationFor(s))).toBe(false);
  });
});

describe("what leaders see", () => {
  it("clamps the minimum group size to the allowed range", () => {
    expect(run(initialState(), { type: "setMinGroup", value: 2 }).minGroup).toBe(5);
    expect(run(initialState(), { type: "setMinGroup", value: 99 }).minGroup).toBe(15);
    expect(run(initialState(), { type: "setMinGroup", value: 9 }).minGroup).toBe(9);
  });

  it("hides small groups and adds complementary suppression", () => {
    const v = cohortView(5, true);
    const hidden = v.rows.filter((r) => r.suppressed);
    expect(hidden.map((r) => r.key).sort()).toEqual(["Design", "Humanities"]);
    expect(hidden.find((r) => r.key === "Design")?.reason).toBe("small_group");
    expect(hidden.find((r) => r.key === "Humanities")?.reason).toBe("complementary");
    expect(v.rows.every((r) => !r.suppressed || (r.n === null && r.value === null))).toBe(true);
  });

  it("hides more groups as the minimum rises", () => {
    expect(cohortView(15, true).hidden).toBeGreaterThan(cohortView(5, true).hidden);
    expect(cohortView(15, true).rows.find((r) => r.key === "Civil engineering")?.suppressed).toBe(false);
    expect(cohortView(16, true).rows.find((r) => r.key === "Civil engineering")?.suppressed).toBe(true);
  });

  it("counts the student only when they agreed to anonymous statistics", () => {
    const n = (counted: boolean) => cohortView(5, counted).rows.find((r) => r.key === "Physics")?.n;
    expect(n(true)).toBe(8);
    expect(n(false)).toBe(7);
    expect(cohortView(5, true).total).toBe(SAMPLE_COHORT.reduce((a, c) => a + c.n, 0) + 1);
  });

  it("never exposes individual data", () => {
    const text = JSON.stringify(cohortView(5, true));
    expect(text).not.toMatch(/PHQ|note/i);
  });
});

describe("keyboard helper", () => {
  const enabled = [true, true, false, false];
  it("moves between enabled tabs and wraps", () => {
    expect(nextEnabledIndex("ArrowRight", 0, enabled)).toBe(1);
    expect(nextEnabledIndex("ArrowRight", 1, enabled)).toBe(0);
    expect(nextEnabledIndex("ArrowLeft", 0, enabled)).toBe(1);
    expect(nextEnabledIndex("Home", 1, enabled)).toBe(0);
    expect(nextEnabledIndex("End", 0, enabled)).toBe(1);
    expect(nextEnabledIndex("a", 0, enabled)).toBeNull();
  });
});
