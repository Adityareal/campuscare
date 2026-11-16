"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import Link from "next/link";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  FastForwardIcon,
  InfoIcon,
  MinusCircleIcon,
  PauseIcon,
  PlayIcon,
  ProhibitIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, Notice, Panel, Ref, TriageBadge, cx, linkClass } from "@/components/ui";
import { CrisisContacts } from "@/components/demo/primitives";
import { usePrefersReducedMotion } from "@/components/demo/use-reduced-motion";
import { phqSummary, STATUS_LABEL, type Evaluation, type LogStatus } from "@/lib/demo-flow/evaluate";
import type { Action, DemoState } from "@/lib/demo-flow/state";
import { RULE_LABELS } from "@/lib/risk/rules";
import { CATEGORY_LEAD } from "@/lib/risk/engine";
import { en } from "@/lib/i18n/en";

const DURATION_MS = 3600;
const TICK_MS = 60;

const STATUS_ICON: Record<LogStatus, typeof CheckCircleIcon> = {
  fired: WarningIcon,
  clear: CheckCircleIcon,
  skipped: ProhibitIcon,
  nodata: MinusCircleIcon,
  info: InfoIcon,
};

export function SafetyScreen() {
  return (
    <section aria-labelledby="safety-heading" className="grid gap-4 rounded-panel border border-urgent bg-urgent-soft px-5 py-5 text-urgent-text">
      <div>
        <h3 id="safety-heading" className="text-lg font-semibold">
          {en.assessment.safetyTitle}
        </h3>
        <p className="mt-1 max-w-[62ch] text-sm">{en.assessment.safetyBody}</p>
        <p className="mt-2 max-w-[62ch] text-sm">
          This is the screen a student sees straight after answering, before any alert exists. {en.urgent.danger}
        </p>
      </div>
      <CrisisContacts title="Free support, and emergency help" />
      <p className="text-sm">{en.urgent.teleManas}</p>
    </section>
  );
}

export function StageRules({ state, ev, dispatch }: { state: DemoState; ev: Evaluation; dispatch: Dispatch<Action> }) {
  const reduced = usePrefersReducedMotion();
  const [progress, setProgress] = useState(state.rulesRun ? 1 : 0);
  const [paused, setPaused] = useState(false);
  const animate = useRef(!state.rulesRun);

  const effective = reduced ? 1 : progress;
  const done = effective >= 1;

  useEffect(() => {
    if (reduced || paused || progress >= 1) return;
    const id = setInterval(() => setProgress((p) => Math.min(1, p + TICK_MS / DURATION_MS)), TICK_MS);
    return () => clearInterval(id);
  }, [reduced, paused, progress]);

  useEffect(() => {
    if (done) dispatch({ type: "rulesRan" });
  }, [done, dispatch]);

  const visible = ev.log.filter((l) => l.at <= effective + 1e-9);
  const percent = Math.round(effective * 100);

  const replay = () => {
    animate.current = true;
    setPaused(false);
    setProgress(0);
  };

  return (
    <div className="grid gap-6">
      <p className="max-w-[65ch] text-ink-2">
        Simulation: the written rules check what you entered, one rule at a time, using the same engine as the product. Nothing here is a diagnosis, and a
        person reviews every alert.
      </p>

      {ev.safetyScreen ? <SafetyScreen /> : null}

      <Panel
        title="Evaluation log"
        description="One line per rule. Each rule can fire, not match, be skipped without consent, or lack enough data."
        actions={
          reduced ? null : (
            <div className="flex flex-wrap gap-2">
              {!done ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                    {paused ? <PlayIcon size={16} aria-hidden /> : <PauseIcon size={16} aria-hidden />}
                    {paused ? "Resume" : "Pause"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setProgress(1)}>
                    <FastForwardIcon size={16} aria-hidden />
                    Show all
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={replay}>
                  <ArrowCounterClockwiseIcon size={16} aria-hidden />
                  Replay
                </Button>
              )}
            </div>
          )
        }
      >
        <div
          role="progressbar"
          aria-label="Rules checked"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-75 ease-linear" style={{ transform: `scaleX(${effective})` }} />
        </div>
        <ol aria-label="Rule evaluation log" className="grid gap-0 overflow-hidden rounded-control border border-line bg-surface-2">
          {visible.map((l) => {
            const Icon = STATUS_ICON[l.status];
            return (
              <li
                key={l.key}
                className={cx(
                  "grid gap-x-3 gap-y-0.5 border-b border-line px-3 py-2.5 text-sm last:border-b-0 sm:grid-cols-[8.5rem_minmax(0,1fr)]",
                  animate.current && "animate-[demo-line-in_0.28s_ease-out_both]",
                  l.status === "fired" && "bg-priority-soft",
                )}
              >
                <span className={cx("inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide", l.status === "fired" ? "text-priority-text" : "text-ink-3")}>
                  <Icon size={15} weight={l.status === "fired" ? "fill" : "regular"} aria-hidden />
                  {STATUS_LABEL[l.status]}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{l.label}</span>
                  <span className="block text-ink-2">{l.detail}</span>
                </span>
              </li>
            );
          })}
          {visible.length === 0 ? <li className="px-3 py-2.5 text-sm text-ink-3">Starting.</li> : null}
        </ol>
        <p className="mt-3 text-sm text-ink-3" aria-live="polite">
          {done ? `Finished. ${ev.log.length - 2} rules checked.` : `${percent}% done.`}
        </p>
      </Panel>

      {done ? <Outcome ev={ev} /> : null}
    </div>
  );
}

function Outcome({ ev }: { ev: Evaluation }) {
  const summary = phqSummary(ev.phqScore);
  return (
    <div className="grid gap-4" aria-live="polite">
      {!ev.includePatterns ? (
        <Notice tone="info" title="Patterns were not evaluated">
          Care-team review is off, so check-ins and questionnaires were not read by the rules. Only an explicit request for help reaches the team.
        </Notice>
      ) : null}

      {summary ? (
        <p className="text-sm text-ink-2">
          PHQ-9 score: <span className="font-medium text-ink">{summary}</span>
        </p>
      ) : null}

      {ev.alertRaised && ev.title ? (
        <Panel
          title={
            <span className="flex flex-wrap items-center gap-3">
              <TriageBadge category={ev.category} />
              <span>{ev.title}</span>
            </span>
          }
          description="The rules created one alert. An alert is a request for a person to look, not a decision about the student."
        >
          <ul className="divide-y divide-line">
            {ev.findings.map((f) => (
              <li key={f.dedupeKey} className="grid gap-1.5 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <TriageBadge category={f.category} size="sm" />
                  <p className="font-medium">{RULE_LABELS[f.ruleCode] ?? f.ruleCode}</p>
                </div>
                <p className="text-xs text-ink-3">
                  Rule <Ref>{f.ruleCode}</Ref>, version {f.ruleVersion}, category {CATEGORY_LEAD[f.category].toLowerCase()}
                </p>
                <p className="max-w-[70ch] text-sm text-ink-2">{f.explanation}</p>
              </li>
            ))}
          </ul>
          {ev.category === "URGENT" ? (
            <div className="mt-4">
              <CrisisContacts title="Crisis contacts shown with every urgent case" />
            </div>
          ) : null}
        </Panel>
      ) : (
        <Panel title="No alert">
          <p className="text-sm text-ink-2">The rules found nothing to raise from what was entered.</p>
          <p className="mt-2 text-sm font-medium">No alert does not mean a student is safe.</p>
          <p className="mt-2 max-w-[62ch] text-sm text-ink-2">
            Rules only see what a student chooses to share. Anyone can ask for help at any time, and{" "}
            <Link href="/help-now" className={linkClass}>
              Get help now
            </Link>{" "}
            works without signing in.
          </p>
        </Panel>
      )}
    </div>
  );
}
