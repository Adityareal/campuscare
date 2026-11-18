"use client";

import { useId, type Dispatch } from "react";
import { Button, Notice, Panel, StatusPill, Table, Td, Th, cx } from "@/components/ui";
import { cohortView } from "@/lib/demo-flow/cohort";
import { MIN_GROUP_RANGE, STUDENT_DEPARTMENT } from "@/lib/demo-flow/content";
import type { Action, DemoState } from "@/lib/demo-flow/state";

export function StageLeaders({ state, dispatch }: { state: DemoState; dispatch: Dispatch<Action> }) {
  const sliderId = useId();
  const counted = state.consent.core && state.consent.analytics;
  const view = cohortView(state.minGroup, counted);

  return (
    <div className="grid gap-6">
      <p className="max-w-[65ch] text-ink-2">
        Simulation: the administrator&apos;s view of a sample cohort that includes the student you just played. Administrators see group figures only. No
        answer, score, alert or note from any individual appears here.
      </p>

      <Panel title="Minimum group size" description="Any group smaller than this is hidden. The product never allows fewer than 5.">
        <div className="grid gap-2">
          <label htmlFor={sliderId} className="text-sm font-medium">
            Hide groups with fewer than <output htmlFor={sliderId} className="font-mono tabular-nums">{view.k}</output> students
          </label>
          <input
            id={sliderId}
            type="range"
            min={MIN_GROUP_RANGE.min}
            max={MIN_GROUP_RANGE.max}
            step={1}
            value={state.minGroup}
            onChange={(e) => dispatch({ type: "setMinGroup", value: Number(e.target.value) })}
            className="h-11 w-full accent-accent"
            aria-valuetext={`${view.k} students`}
          />
          <div className="flex justify-between font-mono text-xs text-ink-3" aria-hidden>
            <span>{MIN_GROUP_RANGE.min}</span>
            <span>{MIN_GROUP_RANGE.max}</span>
          </div>
        </div>
      </Panel>

      <Panel title="Average mood by department" description="Sample data. Mood is the average of the 1 to 5 check-in answers from students who agreed to anonymous statistics.">
        <Table caption="Average mood by department, with small groups hidden">
          <thead>
            <tr>
              <Th>Department</Th>
              <Th>Students</Th>
              <Th>Average mood</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.key} className={cx(r.suppressed && "bg-surface-2")}>
                <Td className="font-medium">
                  {r.key}
                  {r.key === STUDENT_DEPARTMENT ? <span className="ml-2 text-xs font-normal text-ink-3">(your student&apos;s department)</span> : null}
                </Td>
                <Td className="font-mono tabular-nums">{r.suppressed ? "Hidden" : r.n}</Td>
                <Td className="font-mono tabular-nums">{r.suppressed ? "Hidden" : r.value?.toFixed(1)}</Td>
                <Td>
                  {r.suppressed ? (
                    <span className="grid gap-1">
                      <StatusPill tone={r.reason === "small_group" ? "warning" : "info"}>{r.reason === "small_group" ? "Small group" : "Complementary"}</StatusPill>
                      <span className="text-ink-3">{r.reasonText}</span>
                    </span>
                  ) : (
                    <StatusPill tone="accent">Shown</StatusPill>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <Td className="font-medium">All departments</Td>
              <Td className="font-mono tabular-nums">{view.total}</Td>
              <Td>Not shown</Td>
              <Td className="text-ink-3">{view.hidden} of {view.rows.length} groups hidden</Td>
            </tr>
          </tfoot>
        </Table>
        <p className="mt-3 text-sm text-ink-3" aria-live="polite">
          {view.hidden === 0 ? "Every group is large enough to show." : `${view.hidden} group${view.hidden === 1 ? " is" : "s are"} hidden at this setting.`}
        </p>
      </Panel>

      <Panel title="Your student in the numbers">
        <p className="text-sm text-ink-2">
          {counted
            ? `Because the student agreed to anonymous statistics, they are counted in ${STUDENT_DEPARTMENT} as one of the ${view.rows.find((r) => r.key === STUDENT_DEPARTMENT)?.suppressed ? "hidden" : view.rows.find((r) => r.key === STUDENT_DEPARTMENT)?.n} students. This makes it harder to tell which one.`
            : "The student did not agree to anonymous statistics, so they are not counted in any figure here."}
        </p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "setConsent", key: "analytics", value: !state.consent.analytics })} disabled={!state.consent.core}>
            {state.consent.analytics ? "Switch anonymous statistics off" : "Switch anonymous statistics on"}
          </Button>
        </div>
      </Panel>

      <Notice tone="info">The floor of 5 holds for every institution. Hidden groups also hide the next smallest one, to make a hidden number harder to work out by subtracting from the total.</Notice>
    </div>
  );
}
