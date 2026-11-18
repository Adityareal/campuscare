"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClass, cx } from "@/components/ui";
import { ErrorLine, SimulationTag } from "@/components/demo/primitives";
import { StageCare } from "@/components/demo/stage-care";
import { StageDecision } from "@/components/demo/stage-decision";
import { StageLeaders } from "@/components/demo/stage-leaders";
import { StageRules } from "@/components/demo/stage-rules";
import { StageStudent } from "@/components/demo/stage-student";
import { STAGES, stageIndex, type StageId } from "@/lib/demo-flow/content";
import { nextEnabledIndex } from "@/lib/demo-flow/keys";
import { demoReducer, evaluationFor, initialState } from "@/lib/demo-flow/state";

export function TryFlow({ initialStage, hasSignInDemo }: { initialStage: StageId; hasSignInDemo: boolean }) {
  const [state, dispatch] = useReducer(demoReducer, initialStage, initialState);
  const ev = useMemo(
    () => evaluationFor(state),
    // Only what the student entered changes the evaluation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.consent.core, state.consent.careTeam, state.weeks, state.phq, state.urgentHelp],
  );

  const index = stageIndex(state.stage);
  const current = STAGES[index]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("stage", state.stage);
    window.history.replaceState(null, "", url);
    headingRef.current?.focus({ preventScroll: false });
  }, [state.stage]);

  const enabled = STAGES.map((_, i) => i <= state.reached);
  const next = STAGES[index + 1];

  return (
    <section aria-labelledby="try-heading" className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="try-heading" className="sr-only">
          Guided walk through the care loop
        </h2>
        <p className="text-sm text-ink-2" aria-live="polite">
          Stage {index + 1} of {STAGES.length}: <span className="font-medium text-ink">{current.label}</span>
        </p>
        <SimulationTag />
      </div>

      <div>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div
            className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-300 ease-out"
            style={{ transform: `scaleX(${(index + 1) / STAGES.length})` }}
          />
        </div>
        <div role="tablist" aria-label="Stages of the care loop" className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {STAGES.map((s, i) => {
            const selected = i === index;
            const reachable = enabled[i] ?? false;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`stage-tab-${s.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls="stage-panel"
                aria-disabled={!reachable}
                aria-label={`Stage ${i + 1}, ${s.label}${reachable ? "" : ", not reached yet"}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => reachable && dispatch({ type: "goto", stage: s.id })}
                onKeyDown={(e) => {
                  const target = nextEnabledIndex(e.key, i, enabled);
                  if (target === null) return;
                  e.preventDefault();
                  const id = STAGES[target]?.id;
                  if (id) dispatch({ type: "goto", stage: id });
                  tabRefs.current[target]?.focus();
                }}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-start gap-1 rounded-control border px-1 py-2 text-center transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-2",
                  selected ? "border-accent bg-accent-soft text-accent-text" : reachable ? "border-line bg-surface text-ink-2 hover:bg-surface-2" : "cursor-not-allowed border-line bg-surface text-ink-3 opacity-70",
                )}
              >
                <span aria-hidden className="font-mono text-xs tabular-nums">
                  {i + 1}
                </span>
                <span aria-hidden className={cx("text-[0.7rem] leading-tight sm:text-sm", selected ? "font-medium" : "max-sm:sr-only")}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        id="stage-panel"
        role="tabpanel"
        aria-labelledby={`stage-tab-${state.stage}`}
        className="rounded-panel border border-line bg-surface shadow-panel"
      >
        <div key={state.stage} className="animate-[demo-rise_0.35s_ease-out_both] px-4 py-6 sm:px-8 sm:py-8">
          <p className="font-mono text-xs uppercase tracking-wide text-ink-3">
            Stage {index + 1} of {STAGES.length}
          </p>
          <h3 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight focus:outline-none md:text-3xl">
            {current.label}
          </h3>
          <p className="mt-1 max-w-[62ch] text-ink-3">{current.blurb}</p>

          <div className="mt-6">
            {state.stage === "student" ? <StageStudent state={state} ev={ev} dispatch={dispatch} /> : null}
            {state.stage === "rules" ? <StageRules state={state} ev={ev} dispatch={dispatch} /> : null}
            {state.stage === "decision" ? <StageDecision state={state} ev={ev} dispatch={dispatch} /> : null}
            {state.stage === "care" ? <StageCare state={state} ev={ev} dispatch={dispatch} /> : null}
            {state.stage === "leaders" ? <StageLeaders state={state} dispatch={dispatch} /> : null}
          </div>
        </div>

        <div className="grid gap-3 border-t border-line px-4 py-4 sm:px-8">
          <ErrorLine>{state.errors.stage}</ErrorLine>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => dispatch({ type: "back" })} disabled={index === 0}>
              <ArrowLeftIcon size={16} aria-hidden />
              Back
            </Button>
            {next ? (
              <Button onClick={() => dispatch({ type: "next" })}>
                Next: {next.label}
                <ArrowRightIcon size={16} aria-hidden />
              </Button>
            ) : (
              <>
                <Link href="/" className={buttonClass("secondary")}>
                  Back to the landing page
                </Link>
                {hasSignInDemo ? (
                  <Link href="/sign-in" className={buttonClass("primary")}>
                    Open the full demo
                    <ArrowRightIcon size={16} aria-hidden />
                  </Link>
                ) : null}
              </>
            )}
            <Button variant="ghost" className="sm:ml-auto" onClick={() => dispatch({ type: "reset" })}>
              <ArrowCounterClockwiseIcon size={16} aria-hidden />
              Reset
            </Button>
          </div>
          {!next && hasSignInDemo ? <p className="text-sm text-ink-3">The full demo on the sign-in page has seeded sample people, cases and weeks of history.</p> : null}
        </div>
      </div>
    </section>
  );
}
