"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarCheckIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, StatusPill, TriageBadge } from "@/components/ui";
import { cx } from "@/components/ui/classes";
import { usePrefersReducedMotion } from "@/components/landing/use-reduced-motion";
import { HERO_CHECK_INS, HERO_EVALUATION, SAMPLE_NOW } from "@/components/landing/sample";
import { fmtDay } from "@/lib/format";
import { RULE_LABELS } from "@/lib/risk/rules";

/**
 * Looping picture of the core story, built from the real triage badge and the real rule text.
 * Phases: 0 to 2 check-ins arrive, 3 a rule fires, 4 the alert appears, 5 a counsellor
 * acknowledges it, 6 a follow-up is scheduled. Only opacity and transform change.
 */
const PHASE_MS = [1300, 1300, 1500, 2000, 1800, 1500, 2600] as const;
const LAST_PHASE = PHASE_MS.length - 1;

const FINDING = HERO_EVALUATION.findings.find((f) => f.ruleCode === "SUSTAINED_HIGH_STRESS");
const FOLLOW_UP_AT = new Date(SAMPLE_NOW.getTime() + 3 * 86_400_000);

function Stage({ on, children, className }: { on: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "transition-[opacity,transform] duration-500 ease-out",
        on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HeroIllustration() {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reduced || !playing) return;
    const id = window.setTimeout(() => setPhase((p) => (p >= LAST_PHASE ? 0 : p + 1)), PHASE_MS[phase] ?? 1500);
    return () => window.clearTimeout(id);
  }, [phase, playing, reduced]);

  const shown = reduced ? LAST_PHASE : phase;
  const ruleOn = shown >= 3;

  return (
    <figure className="m-0">
      <div aria-hidden="true" className="overflow-hidden rounded-panel border border-line bg-surface shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <p className="text-sm font-semibold">Weekly check-ins</p>
          <StatusPill tone="info">Simulation, sample data</StatusPill>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <div className="grid gap-1.5">
            <div className="grid grid-cols-[1fr_repeat(3,3.5rem)] gap-2 text-xs text-ink-3">
              <span>Week of</span>
              <span className="text-right">Mood</span>
              <span className="text-right">Stress</span>
              <span className="text-right">Sleep</span>
            </div>
            {HERO_CHECK_INS.map((c, i) => (
              <Stage key={c.id} on={shown >= i} className="grid grid-cols-[1fr_repeat(3,3.5rem)] gap-2 border-t border-line pt-1.5 text-sm">
                <span className="text-ink-2">{fmtDay(c.at)}</span>
                <span className="text-right font-mono tabular-nums">{c.mood}/5</span>
                <span className={cx("text-right font-mono tabular-nums", ruleOn && "font-semibold text-monitor-text")}>{c.stress}/5</span>
                <span className="text-right font-mono tabular-nums">{c.sleep}/5</span>
              </Stage>
            ))}
          </div>

          <Stage on={ruleOn} className="rounded-control bg-surface-2 px-3.5 py-3">
            <p className="text-xs font-medium text-ink-3">Written rule fired</p>
            <p className="mt-0.5 text-sm font-semibold">{RULE_LABELS.SUSTAINED_HIGH_STRESS}</p>
            <p className="mt-1 text-sm text-ink-2">{FINDING?.explanation}</p>
          </Stage>

          <Stage on={shown >= 4} className="grid gap-3 rounded-control border border-line px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <TriageBadge category={HERO_EVALUATION.category} />
              {shown >= 5 ? <StatusPill tone="accent">Acknowledged by a counsellor</StatusPill> : <StatusPill>Waiting for review</StatusPill>}
            </div>
            <p className="text-sm font-semibold">{HERO_EVALUATION.title}</p>
            <div className="grid gap-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cx(
                    "h-full origin-left rounded-full bg-monitor ease-linear transition-transform",
                    shown >= 5 && "bg-accent",
                  )}
                  style={{ transform: `scaleX(${shown >= 4 ? 0.72 : 1})`, transitionDuration: shown === 4 ? "1700ms" : "0ms" }}
                />
              </div>
              <p className="text-xs text-ink-3">{shown >= 5 ? "Reviewed by a person before any outreach" : "Sample target: acknowledge within 24 hours"}</p>
            </div>
          </Stage>

          <Stage on={shown >= 6} className="flex items-center gap-2.5 rounded-control bg-accent-soft px-3.5 py-2.5 text-sm text-accent-text">
            <CalendarCheckIcon size={20} weight="bold" aria-hidden />
            <span>Follow-up scheduled for {fmtDay(FOLLOW_UP_AT)}</span>
          </Stage>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="max-w-[44ch] text-sm text-ink-3">
          A simulation with sample data: three weekly check-ins show high stress, a written rule fires and explains itself, a counsellor acknowledges the alert, and a
          follow-up is scheduled.
        </p>
        {reduced ? null : (
          <Button variant="secondary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause the animation" : "Play the animation"}>
            {playing ? <PauseIcon size={18} weight="bold" aria-hidden /> : <PlayIcon size={18} weight="bold" aria-hidden />}
            {playing ? "Pause" : "Play"}
          </Button>
        )}
      </figcaption>
    </figure>
  );
}
