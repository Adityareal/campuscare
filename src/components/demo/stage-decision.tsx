"use client";

import { useState, type Dispatch } from "react";
import { Button, EmptyState, Field, Fieldset, Notice, Panel, Ref, StatusPill, Table, Td, Textarea, Th, TriageBadge, cx } from "@/components/ui";
import { CrisisContacts, ErrorLine } from "@/components/demo/primitives";
import {
  ACK_WINDOW,
  ATTEMPT_OUTCOME_LABEL,
  ATTEMPT_OUTCOMES,
  DECISION_KEYS,
  DECISION_LABEL,
  FEEDBACK_KEYS,
  FEEDBACK_LABEL,
  SAMPLE_NOW,
  type AttemptOutcome,
} from "@/lib/demo-flow/content";
import type { Evaluation } from "@/lib/demo-flow/evaluate";
import { caseIsOpen, consequenceFor, effectiveCategory, needsReviewNote, type Action, type DemoState } from "@/lib/demo-flow/state";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { alertTitle, RECOMMENDED_ACTION } from "@/lib/risk/engine";
import { RULE_LABELS } from "@/lib/risk/rules";

export function AttemptForm({ state, dispatch }: { state: DemoState; dispatch: Dispatch<Action> }) {
  const [outcome, setOutcome] = useState<AttemptOutcome>("NO_ANSWER");
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
        <Field id="attempt-outcome" label="Contact attempt by phone, to the student">
          <select
            id="attempt-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as AttemptOutcome)}
            className="block w-full rounded-control border border-line-input bg-surface px-3 py-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {ATTEMPT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {ATTEMPT_OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="secondary" onClick={() => dispatch({ type: "recordAttempt", outcome })} disabled={state.care.alertClosed}>
          Record attempt
        </Button>
      </div>
      <ErrorLine>{state.errors.attempt}</ErrorLine>
      <ul aria-label="Recorded contact attempts" className="grid gap-1 text-sm">
        {state.review.attempts.length === 0 ? (
          <li className="text-ink-3">No attempts recorded yet.</li>
        ) : (
          state.review.attempts.map((a, i) => (
            <li key={i}>
              Attempt {i + 1}: {ATTEMPT_OUTCOME_LABEL[a.outcome].toLowerCase()}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function StageDecision({ state, ev, dispatch }: { state: DemoState; ev: Evaluation; dispatch: Dispatch<Action> }) {
  if (!ev.alertRaised) {
    return (
      <div className="grid gap-6">
        <EmptyState title="No alert was raised, so nobody has anything to review">
          The answers you entered did not match a rule. Go back and pick &quot;Exam pressure building&quot; or &quot;Asks for urgent help&quot; to see a counsellor&apos;s view,
          or continue to see what leaders see.
        </EmptyState>
        <p className="text-sm font-medium">No alert does not mean a student is safe.</p>
      </div>
    );
  }

  const category = effectiveCategory(state, ev);
  const window = category === "ROUTINE" ? null : ACK_WINDOW[category];
  const due = window ? new Date(SAMPLE_NOW.getTime() + window.ms) : null;
  const title = alertTitle(category, ev.findings);
  const { review } = state;
  const noteRequired = needsReviewNote(category, review.decision);
  const selected = review.decision ? consequenceFor(review.decision, category) : null;
  const evidence = ev.findings.flatMap((f) => f.evidence.map((e, i) => ({ f, e, key: `${f.dedupeKey}-${i}` })));

  return (
    <div className="grid gap-6">
      <p className="max-w-[65ch] text-ink-2">
        Simulation: this is the alert a counsellor would open. Choose what happens next. The system can raise an alert, but only a person can review it.
      </p>

      {category === "URGENT" ? (
        <Notice tone="danger" title="Follow the crisis protocol">
          <p>Try to reach the student and the on-call responder now, and record every attempt, including attempts that did not get through.</p>
        </Notice>
      ) : null}

      <Panel
        title={
          <span className="flex flex-wrap items-center gap-3">
            <TriageBadge category={category} />
            <span>{title}</span>
          </span>
        }
        description={
          <>
            <Ref>SAMPLE-0001</Ref> raised {fmtDay(SAMPLE_NOW)}.{" "}
            {window && due ? (
              <>
                Acknowledge within {window.label} ({fmtDateTime(due)}).
              </>
            ) : null}
          </>
        }
      >
        <p className="text-sm text-ink-3">Categories are operational labels for how soon to respond, not diagnoses.</p>

        <h3 className="mt-5 text-sm font-semibold">Why this alert was raised</h3>
        <div className="mt-2">
          <Table caption="Evidence behind this alert">
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Date</Th>
                <Th>Evidence</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody>
              {evidence.map(({ f, e, key }) => (
                <tr key={key}>
                  <Td>{RULE_LABELS[f.ruleCode] ?? f.ruleCode}</Td>
                  <Td className="whitespace-nowrap">{fmtDay(new Date(e.at))}</Td>
                  <Td>{e.label}</Td>
                  <Td className="font-mono tabular-nums">{e.value === null ? "None" : e.value}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <h3 className="mt-5 text-sm font-semibold">Recommended action</h3>
        <p className="mt-1 text-sm">{RECOMMENDED_ACTION[category]}</p>
      </Panel>

      {category === "URGENT" ? <CrisisContacts title="Crisis contacts" /> : null}

      <Panel
        title="Review"
        description={category === "URGENT" ? "A written note is required for urgent alerts." : "Record what you decided and whether the alert was useful."}
      >
        {review.recorded ? (
          <div className="grid gap-4">
            <Notice tone="success" title="Review recorded">
              Decision: {review.decision ? DECISION_LABEL[review.decision] : ""}.
              {review.feedback ? ` Feedback: ${FEEDBACK_LABEL[review.feedback].toLowerCase()}.` : ""}
              {review.note ? ` Note: ${review.note}` : ""}
            </Notice>
            {review.decision ? <Consequences decision={review.decision} category={category} caseOpen={caseIsOpen(state, ev)} recorded /> : null}
          </div>
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: "submitReview" });
            }}
          >
            <Fieldset legend="Decision">
              {DECISION_KEYS.map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="decision"
                    value={k}
                    checked={review.decision === k}
                    onChange={() => dispatch({ type: "setDecision", value: k })}
                    className="size-4 accent-accent"
                  />
                  {DECISION_LABEL[k]}
                </label>
              ))}
            </Fieldset>

            {selected && review.decision ? (
              <div aria-live="polite">
                <Consequences decision={review.decision} category={category} caseOpen={selected.caseOpened} recorded={false} />
              </div>
            ) : null}

            <Fieldset legend="Was the alert useful?" hint="Optional. Helps clinicians tune the rules.">
              {FEEDBACK_KEYS.map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="feedback"
                    value={k}
                    checked={review.feedback === k}
                    onChange={() => dispatch({ type: "setFeedback", value: k })}
                    className="size-4 accent-accent"
                  />
                  {FEEDBACK_LABEL[k]}
                </label>
              ))}
              {review.feedback ? (
                <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => dispatch({ type: "setFeedback", value: null })}>
                  Clear feedback
                </Button>
              ) : null}
            </Fieldset>

            <Field
              id="review-note"
              label="Review note"
              optionalLabel={noteRequired ? undefined : "Optional"}
              hint={noteRequired ? "Required for this alert. At least a sentence." : "Written for the care team only."}
              error={state.errors.review && /note|Explain/.test(state.errors.review) ? state.errors.review : null}
            >
              <Textarea id="review-note" value={review.note} onChange={(e) => dispatch({ type: "setNote", value: e.target.value })} maxLength={4000} required={noteRequired} />
            </Field>

            {state.errors.review && !/Explain/.test(state.errors.review) ? <ErrorLine>{state.errors.review}</ErrorLine> : null}

            <div>
              <Button type="submit">Record review</Button>
            </div>
          </form>
        )}
      </Panel>

      {review.recorded && category === "URGENT" ? (
        <Panel title="Contact and escalation attempts" description="Record each attempt to reach the student. An urgent alert cannot close without one.">
          <AttemptForm state={state} dispatch={dispatch} />
        </Panel>
      ) : null}

      {review.recorded ? (
        <Panel title="Close the alert" description={category === "URGENT" ? "Needs a review decision with a written note and at least one recorded contact attempt." : "Needs a recorded review decision."}>
          {state.care.alertClosed ? (
            <StatusPill tone="neutral">Alert closed by a person</StatusPill>
          ) : (
            <div className="grid gap-3">
              <div>
                <Button variant="secondary" onClick={() => dispatch({ type: "closeAlert" })}>
                  Close alert
                </Button>
              </div>
              <ErrorLine>{state.errors.closeAlert}</ErrorLine>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function Consequences({ decision, category, caseOpen, recorded }: { decision: Parameters<typeof consequenceFor>[0]; category: Parameters<typeof consequenceFor>[1]; caseOpen: boolean; recorded: boolean }) {
  const c = consequenceFor(decision, category);
  const outcomes: { label: string; on: boolean }[] = [
    { label: "Case", on: recorded ? caseOpen : c.caseOpened },
    { label: "Questionnaire requested", on: c.questionnaireRequested },
    { label: "Referral created", on: c.referralCreated },
    { label: "Crisis protocol", on: c.crisisProtocol },
  ];
  return (
    <section aria-label={recorded ? "What this caused" : "What this would cause"} className="rounded-control border border-line bg-surface-2 px-4 py-3">
      <h3 className="text-sm font-semibold">{recorded ? "What this caused" : "What this would cause"}</h3>
      <ul className="mt-2 grid gap-1 text-sm text-ink-2">
        {c.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Effects">
        {outcomes.map((o) => (
          <li key={o.label} className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", o.on ? "bg-accent-soft text-accent-text" : "bg-surface text-ink-3")}>
            {o.label}: {o.on ? "yes" : "no"}
          </li>
        ))}
      </ul>
    </section>
  );
}
