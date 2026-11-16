"use client";

import { useState, type Dispatch } from "react";
import { LifecycleRail } from "@/components/care/lifecycle-rail";
import { AttemptForm } from "@/components/demo/stage-decision";
import { ErrorLine } from "@/components/demo/primitives";
import { Button, EmptyState, Field, Notice, Panel, StatusPill, Textarea } from "@/components/ui";
import { DECISION_LABEL, SAMPLE_NOW } from "@/lib/demo-flow/content";
import type { Evaluation } from "@/lib/demo-flow/evaluate";
import { caseIsOpen, effectiveCategory, milestoneDates, type Action, type DemoState } from "@/lib/demo-flow/state";

export function StageCare({ state, ev, dispatch }: { state: DemoState; ev: Evaluation; dispatch: Dispatch<Action> }) {
  const [outcomeText, setOutcomeText] = useState(state.care.outcome);

  if (!caseIsOpen(state, ev)) {
    return (
      <div className="grid gap-4">
        <EmptyState title="No case was opened">
          {!ev.alertRaised
            ? "No alert was raised, so there is nothing to follow. Go back and choose a starting point that raises an alert to see a case."
            : `The decision was "${state.review.decision ? DECISION_LABEL[state.review.decision] : "none"}", which opens no case. Go back and choose another decision to see one.`}
        </EmptyState>
        <p className="text-sm font-medium">No alert does not mean a student is safe.</p>
      </div>
    );
  }

  const { care } = state;
  const dates = milestoneDates(state, ev);
  const category = effectiveCategory(state, ev);
  const closed = care.caseClosed;
  const sessionState = !care.booked ? "No session booked." : care.attendance === "attended" ? "Session attended." : care.attendance === "missed" ? "Session missed. Another can be booked." : "Session booked, waiting to happen.";

  return (
    <div className="grid gap-6">
      <p className="max-w-[65ch] text-ink-2">
        Simulation: the case page a counsellor works from. Each step is recorded by a person, and a case cannot close until the outcome is written down.
      </p>

      <Panel title="Lifecycle" description="Each step shows when it first happened in the simulation.">
        <LifecycleRail
          c={{
            openedAt: SAMPLE_NOW,
            receivedAt: dates.received ?? SAMPLE_NOW,
            acknowledgedAt: dates.acknowledged,
            reviewedAt: dates.reviewed,
            contactedAt: dates.contacted,
            arrangedAt: dates.arranged,
            referredAt: dates.referred,
            appointmentUpdatedAt: dates.appointment,
            followUpScheduledAt: dates.followUp,
            outcomeDocumentedAt: dates.outcome,
            closedAt: dates.ended,
            returnedToMonitoringAt: null,
            status: closed ? "CLOSED" : dates.contacted || dates.arranged ? "ACTIVE" : "OPEN",
          }}
        />
      </Panel>

      {closed ? (
        <Notice tone="success" title="Case closed by a person">
          The loop is complete: a student asked for or was offered support, a person decided, care happened, and the outcome was documented before closing.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Care actions">
          <div className="grid gap-6">
            <section className="grid gap-2" aria-labelledby="act-contact">
              <h3 id="act-contact" className="text-sm font-semibold">
                Contact
              </h3>
              <div>
                <Button variant="secondary" disabled={closed || !!dates.contacted} onClick={() => dispatch({ type: "recordContact" })}>
                  {dates.contacted ? "Student contacted" : "Record that the student was contacted"}
                </Button>
              </div>
            </section>

            <section className="grid gap-2" aria-labelledby="act-session">
              <h3 id="act-session" className="text-sm font-semibold">
                Sample session
              </h3>
              <p className="text-sm text-ink-2" aria-live="polite">
                {sessionState}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={closed || (care.booked && care.attendance === null) || care.attendance === "attended"} onClick={() => dispatch({ type: "bookSession" })}>
                  {care.attendance === "missed" ? "Book another session" : "Book a sample session"}
                </Button>
                <Button variant="secondary" disabled={closed || !care.booked || care.attendance !== null} onClick={() => dispatch({ type: "markAttended" })}>
                  Mark attended
                </Button>
                <Button variant="secondary" disabled={closed || !care.booked || care.attendance !== null} onClick={() => dispatch({ type: "markMissed" })}>
                  Mark missed
                </Button>
              </div>
              <ErrorLine>{state.errors.booking}</ErrorLine>
              <p className="text-sm text-ink-3">Booking creates a referral for the sample student if there is none, and marks the session as arranged.</p>
            </section>

            <section className="grid gap-2" aria-labelledby="act-follow">
              <h3 id="act-follow" className="text-sm font-semibold">
                Follow-up
              </h3>
              <p className="text-sm text-ink-2" aria-live="polite">
                {care.followUpsPending} scheduled, {care.followUpsDone} completed.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={closed} onClick={() => dispatch({ type: "scheduleFollowUp" })}>
                  Schedule a follow-up
                </Button>
                <Button variant="secondary" disabled={closed || care.followUpsPending === 0} onClick={() => dispatch({ type: "completeFollowUp" })}>
                  Complete a follow-up
                </Button>
              </div>
              <ErrorLine>{state.errors.followUp}</ErrorLine>
            </section>
          </div>
        </Panel>

        <Panel title="Outcome and closing">
          <div className="grid gap-6">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                dispatch({ type: "documentOutcome", text: outcomeText });
              }}
            >
              <Field id="care-outcome" label="Outcome" hint="Needed before closing the case." error={state.errors.outcome}>
                <Textarea id="care-outcome" value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)} disabled={closed} maxLength={4000} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="secondary" disabled={closed}>
                  Document outcome
                </Button>
                {care.outcome ? <StatusPill tone="accent">Outcome documented</StatusPill> : null}
              </div>
            </form>

            {category === "URGENT" && !care.alertClosed ? (
              <section className="grid gap-2" aria-labelledby="act-attempts">
                <h3 id="act-attempts" className="text-sm font-semibold">
                  Contact attempts for the urgent alert
                </h3>
                <AttemptForm state={state} dispatch={dispatch} />
              </section>
            ) : null}

            <section className="grid gap-3" aria-labelledby="act-close">
              <h3 id="act-close" className="text-sm font-semibold">
                Close
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={care.alertClosed} onClick={() => dispatch({ type: "closeAlert" })}>
                  {care.alertClosed ? "Alert closed" : "Close alert"}
                </Button>
                <Button disabled={closed} onClick={() => dispatch({ type: "closeCase" })}>
                  Close case
                </Button>
              </div>
              <ErrorLine>{state.errors.closeAlert}</ErrorLine>
              <ErrorLine>{state.errors.closeCase}</ErrorLine>
              <p className="text-sm text-ink-3">A case needs a documented outcome, every linked alert closed and no follow-up still scheduled.</p>
            </section>
          </div>
        </Panel>
      </div>
    </div>
  );
}
