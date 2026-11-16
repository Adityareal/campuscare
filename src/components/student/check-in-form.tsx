"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChoiceRow } from "@/components/student/choice";
import { Field, Fieldset, Textarea } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { submitCheckInAction } from "@/app/student/check-in/actions";

type ScaleField = "mood" | "stress" | "sleep" | "energy" | "social" | "academicPressure";

export type CheckInFormLabels = {
  scales: { field: ScaleField; legend: string; options: string[] }[];
  skip: string;
  talkLegend: string;
  talkOptions: { value: "NO" | "NOT_NOW" | "YES"; label: string }[];
  noteLabel: string;
  noteHelp: string;
  optional: string;
  submit: string;
  pending: string;
  reviewPrivacy: string;
};

/** Six optional 1 to 5 ratings, an optional wish to talk, and an optional note. Nothing is
 * preselected, and "Skip" clears a rating the student changed their mind about. */
export function CheckInForm({ labels }: { labels: CheckInFormLabels }) {
  const [state, formAction] = useActionState(submitCheckInAction, IDLE);

  return (
    <form action={formAction} className="grid gap-8">
      {labels.scales.map((scale) => (
        <Fieldset key={scale.field} legend={scale.legend}>
          <div className="grid gap-2 sm:grid-cols-3">
            {scale.options.map((option, i) => (
              <ChoiceRow
                key={option}
                name={scale.field}
                value={i + 1}
                label={
                  <>
                    <span className="mr-2 font-mono tabular-nums text-ink-3">{i + 1}</span>
                    {option}
                  </>
                }
              />
            ))}
            <ChoiceRow name={scale.field} value="" label={labels.skip} />
          </div>
        </Fieldset>
      ))}

      <Fieldset legend={labels.talkLegend}>
        <div className="grid gap-2 sm:grid-cols-3">
          {labels.talkOptions.map((o) => (
            <ChoiceRow key={o.value} name="wantsToTalk" value={o.value} label={o.label} />
          ))}
        </div>
      </Fieldset>

      <Field id="note" label={labels.noteLabel} hint={labels.noteHelp} optionalLabel={labels.optional}>
        <Textarea id="note" name="note" maxLength={1000} rows={4} aria-describedby="note-hint" />
      </Field>

      <div className="grid gap-3">
        <ActionMessage state={state} />
        {state.code === "CONSENT_REQUIRED" ? (
          <Link href="/student/privacy" className="font-medium text-accent-text underline underline-offset-4">
            {labels.reviewPrivacy}
          </Link>
        ) : null}
        <div>
          <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
