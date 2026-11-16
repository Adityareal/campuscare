"use client";

import { useMemo, useState } from "react";
import { Notice, TriageBadge } from "@/components/ui";
import { cx } from "@/components/ui/classes";
import { evaluateSample, weeklyCheckIns } from "@/components/landing/sample";
import { fmtDay } from "@/lib/format";
import { DEFAULT_RULES, RULE_LABELS } from "@/lib/risk/rules";

const WEEKS = ["Three weeks ago", "Two weeks ago", "Last week"] as const;
const SCALE = [1, 2, 3, 4, 5] as const;
const RULE_CODE = "SUSTAINED_HIGH_STRESS";

/** Runs the product's own evaluateRisk with DEFAULT_RULES on three stress ratings, in the browser. */
export function RuleWidget() {
  const [ratings, setRatings] = useState<number[]>([3, 4, 3]);

  const result = useMemo(() => {
    const evaluation = evaluateSample(weeklyCheckIns(ratings.map((stress) => ({ stress }))));
    const finding = evaluation.findings.find((f) => f.ruleCode === RULE_CODE);
    return { evaluation, finding };
  }, [ratings]);

  const { threshold, consecutive } = DEFAULT_RULES.sustainedHigh;

  return (
    <div className="rounded-panel border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-base font-semibold">See a rule work</h3>
        <p className="mt-1 text-sm text-ink-3">
          Rate stress from 1 (low) to 5 (high) for three weekly check-ins. The rule &quot;{RULE_LABELS[RULE_CODE]}&quot; fires when stress is {threshold} or higher in
          {" "}{consecutive} check-ins in a row.
        </p>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
        <div className="grid gap-5">
          {WEEKS.map((week, w) => {
            const name = `rule-week-${w}`;
            return (
              <fieldset key={week} className="grid gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">
                  {week} <span className="font-normal text-ink-3">(stress rating)</span>
                </legend>
                <div className="grid grid-cols-5 gap-1.5">
                  {SCALE.map((value) => (
                    <div key={value}>
                      <input
                        type="radio"
                        id={`${name}-${value}`}
                        name={name}
                        value={value}
                        checked={ratings[w] === value}
                        onChange={() => setRatings((prev) => prev.map((r, i) => (i === w ? value : r)))}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={`${name}-${value}`}
                        className={cx(
                          "flex h-11 cursor-pointer items-center justify-center rounded-control border border-line-input bg-surface font-mono text-sm tabular-nums text-ink-2",
                          "transition-[background-color,color] duration-150 hover:bg-surface-2",
                          "peer-checked:border-accent peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-accent-ink",
                          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                        )}
                      >
                        {value}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-ink-3">Selected: {ratings[w]} of 5</p>
              </fieldset>
            );
          })}
        </div>

        <div role="status" aria-live="polite" className="grid content-start gap-3">
          {result.finding ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <TriageBadge category={result.finding.category} />
                <span className="text-sm font-semibold">Rule fired</span>
              </div>
              <p className="text-sm font-semibold">{result.evaluation.title}</p>
              <p className="rounded-control bg-surface-2 px-3.5 py-3 text-sm text-ink-2">{result.finding.explanation}</p>
              <p className="text-sm text-ink-2">{result.evaluation.action}</p>
            </>
          ) : (
            <Notice tone="success" title="No alert">
              <p>These ratings do not match the rule, so nothing is raised.</p>
              <p className="mt-1 font-medium">No alert does not mean a student is safe.</p>
            </Notice>
          )}
          <p className="text-xs text-ink-3">
            Sample dates start {fmtDay(weeklyCheckIns([{}, {}, {}])[0]!.at)}. This is a simulation with sample data.
          </p>
        </div>
      </div>

      <p className="border-t border-line px-5 py-3 text-sm text-ink-3">The same rules as the product, running in your browser. Nothing is sent anywhere.</p>
    </div>
  );
}
