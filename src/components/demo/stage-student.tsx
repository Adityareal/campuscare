"use client";

import { useRef, useState, type Dispatch, type KeyboardEvent } from "react";
import { Button, Notice, Panel, Table, Td, Th, cx } from "@/components/ui";
import { CrisisContacts, ChoiceGroup, ErrorLine, SwitchRow } from "@/components/demo/primitives";
import {
  CHECK_IN_INTRO,
  CONSENT_COPY,
  CONSENT_SAFETY_NOTE,
  CORE_REQUIRED,
  NO_AI_NOTE,
  PRESETS,
  SCALE_KEYS,
  SCALE_OPTIONS,
  SCALE_QUESTION,
  SCALE_SHORT,
  WEEK_COUNT,
  type ConsentKey,
} from "@/lib/demo-flow/content";
import { phqSummary, type Evaluation } from "@/lib/demo-flow/evaluate";
import { nextEnabledIndex } from "@/lib/demo-flow/keys";
import { PHQ9 } from "@/lib/instruments";
import type { Action, DemoState } from "@/lib/demo-flow/state";

const CONSENT_KEYS: ConsentKey[] = ["core", "careTeam", "analytics"];

export function StageStudent({ state, ev, dispatch }: { state: DemoState; ev: Evaluation; dispatch: Dispatch<Action> }) {
  const { consent } = state;
  const locked = !consent.core;

  return (
    <div className="grid gap-8">
      <p className="max-w-[65ch] text-ink-2">
        You are a student at a sample university. Everything you enter stays in this page, nothing is saved or sent, and the rules in the next stage are the
        same code the product runs.
      </p>

      <Panel
        title="1. Your privacy choices"
        description="Choose who can see what. These are the three consent scopes in the student app. The simulation starts with all three on; in the app only the first is on until the student chooses. Switch any of them off to see what changes."
      >
        <div className="divide-y divide-line">
          {CONSENT_KEYS.map((key) => (
            <SwitchRow
              key={key}
              label={CONSENT_COPY[key].title}
              description={CONSENT_COPY[key].body}
              checked={consent[key]}
              onChange={(value) => dispatch({ type: "setConsent", key, value })}
              note={
                key === "core" && !consent.core ? (
                  <span>{CORE_REQUIRED}</span>
                ) : key === "careTeam" && consent.core && !consent.careTeam ? (
                  <span>{CONSENT_SAFETY_NOTE}</span>
                ) : null
              }
            />
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-3">{NO_AI_NOTE}</p>
        <div className="mt-3">
          <ErrorLine>{state.errors.input}</ErrorLine>
        </div>
      </Panel>

      <Panel
        title="2. Fill the weeks with a starting point"
        description="Pick a preset, then change any answer you like. Every preset is invented sample data."
        className={cx(locked && "opacity-70")}
      >
        <div role="group" aria-label="Starting points" className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={state.preset === p.id}
              disabled={locked}
              onClick={() => dispatch({ type: "preset", id: p.id })}
              className={cx(
                "grid min-h-11 gap-0.5 rounded-control border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed",
                state.preset === p.id ? "border-accent bg-accent-soft text-accent-text" : "border-line-input bg-surface hover:bg-surface-2",
              )}
            >
              <span className="text-sm font-semibold">
                {p.label}
                {state.preset === p.id ? <span className="ml-2 font-normal">(selected)</span> : null}
              </span>
              <span className="text-sm text-ink-2">{p.description}</span>
            </button>
          ))}
        </div>
        {locked ? <p className="mt-3 text-sm text-ink-3">Switch on &quot;{CONSENT_COPY.core.title}&quot; first.</p> : null}
      </Panel>

      <WeeklyCheckIns state={state} dispatch={dispatch} />

      <PhqSection state={state} ev={ev} dispatch={dispatch} />

      <Panel title="5. Ask for help" description="Optional. A help request is always visible to the care team, because you asked.">
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-accent"
            checked={state.urgentHelp}
            disabled={locked}
            onChange={(e) => dispatch({ type: "setUrgentHelp", value: e.target.checked })}
          />
          <span>
            <span className="font-medium">I want to ask for urgent support now</span>
            <span className="mt-0.5 block text-ink-3">This sends one urgent support request in the simulation.</span>
          </span>
        </label>
        {state.urgentHelp ? (
          <div className="mt-4">
            <CrisisContacts />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function WeeklyCheckIns({ state, dispatch }: { state: DemoState; dispatch: Dispatch<Action> }) {
  const [week, setWeek] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const locked = !state.consent.core;
  const enabled = Array.from({ length: WEEK_COUNT }, () => true);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextEnabledIndex(e.key, i, enabled);
    if (next === null) return;
    e.preventDefault();
    setWeek(next);
    refs.current[next]?.focus();
  };

  return (
    <Panel title="3. Four weekly check-ins" description={CHECK_IN_INTRO} className={cx(locked && "opacity-70")}>
      <div role="tablist" aria-label="Check-in week" className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: WEEK_COUNT }, (_, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`week-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={week === i}
            aria-controls="week-panel"
            tabIndex={week === i ? 0 : -1}
            onClick={() => setWeek(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "inline-flex h-11 min-w-24 items-center justify-center rounded-control border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              week === i ? "border-accent bg-accent-soft text-accent-text" : "border-line-input bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            Week {i + 1}
          </button>
        ))}
      </div>

      <div id="week-panel" role="tabpanel" aria-labelledby={`week-tab-${week}`} tabIndex={0} className="grid gap-5 focus-visible:outline-2 focus-visible:outline-focus">
        {SCALE_KEYS.map((key) => (
          <ChoiceGroup
            key={`${week}-${key}`}
            legend={SCALE_QUESTION[key]}
            disabled={locked}
            value={state.weeks[week]?.[key] ?? null}
            options={SCALE_OPTIONS[key].map((label, idx) => ({ value: idx + 1, label }))}
            onChange={(value) => dispatch({ type: "setAnswer", week, key, value })}
          />
        ))}
      </div>

      <div className="mt-8">
        <Table caption="Your four weekly check-ins, as the rules will read them">
          <thead>
            <tr>
              <Th>Week</Th>
              {SCALE_KEYS.map((k) => (
                <Th key={k}>{SCALE_SHORT[k]}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.weeks.map((w, i) => (
              <tr key={i}>
                <Td className="font-medium">{i + 1}</Td>
                {SCALE_KEYS.map((k) => {
                  const v = w[k];
                  return (
                    <Td key={k} className={v === null ? "text-ink-3" : undefined}>
                      {v === null ? "Skipped" : (
                        <>
                          <span className="font-mono tabular-nums">{v}</span> {SCALE_OPTIONS[k][v - 1]}
                        </>
                      )}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Panel>
  );
}

function PhqSection({ state, ev, dispatch }: { state: DemoState; ev: Evaluation; dispatch: Dispatch<Action> }) {
  const locked = !state.consent.core;
  const answeredCount = state.phq.filter((a) => a !== null).length;
  const summary = phqSummary(ev.phqScore);
  return (
    <Panel
      title="4. PHQ-9 questionnaire"
      description="Optional. The questions and answers are the published wording. All nine answers are needed to get a score."
      className={cx(locked && "opacity-70")}
    >
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control text-sm font-medium text-accent-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {answeredCount === 0 ? "Open the nine questions" : `Nine questions, ${answeredCount} answered`}
        </summary>
        <div className="mt-4 grid gap-5">
          <p className="max-w-[65ch] text-sm text-ink-2">{PHQ9.stem}</p>
          {PHQ9.items.map((item, i) => (
            <ChoiceGroup
              key={i}
              legend={`${i + 1}. ${item}`}
              disabled={locked}
              value={state.phq[i] ?? null}
              options={PHQ9.options.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(value) => dispatch({ type: "setPhq", index: i, value })}
            />
          ))}
          <p className="text-xs text-ink-3">{PHQ9.attribution}</p>
        </div>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p aria-live="polite" className="text-sm text-ink-2">
          {summary ? `Score ${summary}` : answeredCount > 0 ? `${answeredCount} of 9 answered. Not scored until all nine are answered.` : "Not taken."}
        </p>
        {answeredCount > 0 ? (
          <Button variant="ghost" size="sm" disabled={locked} onClick={() => dispatch({ type: "clearPhq" })}>
            Clear answers
          </Button>
        ) : null}
      </div>
      {ev.safetyScreen ? (
        <div className="mt-4">
          <Notice tone="info" title="Question 9 is above Not at all">
            Your safety screen will appear first in the next stage, before anything else.
          </Notice>
        </div>
      ) : null}
    </Panel>
  );
}
