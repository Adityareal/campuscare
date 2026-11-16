"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChartBarIcon,
  ClipboardTextIcon,
  ClockCountdownIcon,
  HandHeartIcon,
  PauseIcon,
  PlayIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui";
import { cx } from "@/components/ui/classes";
import { nextTabIndex, usePrefersReducedMotion } from "@/components/landing/use-reduced-motion";

type Step = {
  title: string;
  Icon: typeof SquaresFourIcon;
  actor: string;
  does: string;
  never: string;
};

const STEPS: Step[] = [
  {
    title: "Check-in",
    Icon: SquaresFourIcon,
    actor: "The student",
    does: "Answers a few short questions about mood, sleep and stress. Every question can be skipped.",
    never: "Require an answer, or show the care team a student's trends without their consent.",
  },
  {
    title: "Screening",
    Icon: ClipboardTextIcon,
    actor: "The student",
    does: "Completes PHQ-9 or GAD-7. The result is a score in a range on that questionnaire.",
    never: "Present a score as a diagnosis.",
  },
  {
    title: "Early warning",
    Icon: WarningCircleIcon,
    actor: "Written rules your clinicians can read",
    does: "Rules flag patterns for review and list the check-ins or scores behind each flag.",
    never: "Use a model that reads student answers, or close, lower or dismiss an alert.",
  },
  {
    title: "Human review",
    Icon: UsersThreeIcon,
    actor: "A counsellor or clinician",
    does: "Reads the alert and its evidence, decides what happens next and records the decision.",
    never: "Let an alert close itself. An urgent alert needs a recorded contact attempt and a written note.",
  },
  {
    title: "Referral",
    Icon: HandHeartIcon,
    actor: "The care team suggests, the student decides",
    does: "The care team offers a next step. The student chooses whether to book it.",
    never: "Book or send a student anywhere without their say.",
  },
  {
    title: "Telehealth",
    Icon: VideoCameraIcon,
    actor: "The student and a verified professional",
    does: "A video or in-person session with a professional your institution has verified.",
    never: "Record the consultation.",
  },
  {
    title: "Follow-up",
    Icon: ClockCountdownIcon,
    actor: "The counsellor responsible for the case",
    does: "A follow-up is scheduled after contact, with a reminder to the person responsible.",
    never: "Close a case on its own or message a student about clinical detail outside the app.",
  },
  {
    title: "Institutional insight",
    Icon: ChartBarIcon,
    actor: "Administrators",
    does: "Leaders see anonymous totals by group to plan support.",
    never: "Show an individual student, or a group smaller than the minimum size.",
  },
];

const AUTOPLAY_MS = 7000;

export function CareLoopStepper() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  useEffect(() => {
    if (!autoplay || reduced) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, active, reduced]);

  const select = (index: number) => {
    setActive(index);
    setAutoplay(false);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(event.key, index, STEPS.length);
    if (next === null) return;
    event.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  };

  const step = STEPS[active] ?? STEPS[0]!;

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10">
      <div>
        <div role="tablist" aria-label="Steps of the care loop" aria-orientation="vertical" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1 lg:gap-1">
          {STEPS.map((s, i) => {
            const selected = i === active;
            return (
              <button
                key={s.title}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${i}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cx(
                  "flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-left text-sm transition-[background-color,color] duration-150",
                  selected ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs tabular-nums",
                    selected ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-3",
                  )}
                >
                  {i + 1}
                </span>
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
        {reduced ? null : (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setAutoplay((a) => !a)} aria-pressed={autoplay}>
              {autoplay ? <PauseIcon size={18} weight="bold" aria-hidden /> : <PlayIcon size={18} weight="bold" aria-hidden />}
              {autoplay ? "Pause the tour" : "Play the tour"}
            </Button>
          </div>
        )}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${active}`} tabIndex={0} className="rounded-panel border border-line bg-surface px-5 py-6 md:px-8">
        <div key={active} className="grid gap-6 transition-[opacity,transform] duration-300 ease-out starting:translate-y-2 starting:opacity-0">
          <div className="flex items-center gap-3">
            <step.Icon size={28} className="text-accent-text" aria-hidden />
            <div>
              <p className="text-sm text-ink-3">
                Step {active + 1} of {STEPS.length}
              </p>
              <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
            </div>
          </div>
          <dl className="grid gap-5 md:grid-cols-3">
            <div>
              <dt className="text-sm font-medium text-ink-3">Who acts</dt>
              <dd className="mt-1 text-ink">{step.actor}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-ink-3">What happens</dt>
              <dd className="mt-1 text-ink-2">{step.does}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-ink-3">What the system never does</dt>
              <dd className="mt-1 text-ink-2">{step.never}</dd>
            </div>
          </dl>
        </div>
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-3">
          Select a step, or use the arrow keys, Home and End. {reduced ? "" : "The tour is off until you start it. "}Each step hands over to a person.
        </p>
      </div>
    </div>
  );
}
