"use client";

import { useActionState } from "react";
import { ChoiceRow } from "@/components/student/choice";
import { Fieldset } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { fill } from "@/lib/i18n";
import { submitAssessmentAction } from "@/app/student/assessments/[id]/actions";

export type AssessmentFormProps = {
  assessmentId: string;
  /** Language of the questionnaire wording itself. "en" until a validated translation exists. */
  itemsLang: string;
  stem: string;
  items: string[];
  options: { value: number; label: string }[];
  difficultyHeading: string;
  difficultyQuestion: string;
  difficultyOptions: string[];
  optional: string;
  itemOf: string;
  submit: string;
  pending: string;
  answerAll: string;
};

/** Every item is required; the functional difficulty question is optional. Scoring happens on
 * the server, and the page then shows the stored result in place of this form. */
export function AssessmentForm(props: AssessmentFormProps) {
  const [state, formAction] = useActionState(submitAssessmentAction, IDLE);
  const { items, options } = props;

  return (
    <form action={formAction} className="grid gap-8">
      <input type="hidden" name="assessmentId" value={props.assessmentId} />

      <p className="text-ink-2" lang={props.itemsLang}>
        {props.stem}
      </p>
      <p className="-mt-6 text-sm text-ink-3">{props.answerAll}</p>

      {items.map((item, index) => (
        <Fieldset
          key={index}
          legend={
            <>
              <span className="block text-xs font-normal text-ink-3">{fill(props.itemOf, { n: index + 1, total: items.length })}</span>
              <span lang={props.itemsLang} className="text-base">
                {item}
              </span>
            </>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((o, i) => (
              <ChoiceRow key={o.value} name={`item-${index}`} value={o.value} label={o.label} labelLang={props.itemsLang} required={i === 0} />
            ))}
          </div>
        </Fieldset>
      ))}

      <Fieldset
        legend={
          <>
            <span className="block text-xs font-normal text-ink-3">
              {props.difficultyHeading} ({props.optional})
            </span>
            <span lang={props.itemsLang} className="text-base">
              {props.difficultyQuestion}
            </span>
          </>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {props.difficultyOptions.map((label, value) => (
            <ChoiceRow key={label} name="difficulty" value={value} label={label} labelLang={props.itemsLang} />
          ))}
        </div>
      </Fieldset>

      <div className="grid gap-3">
        <ActionMessage state={state} />
        <div>
          <SubmitButton pendingLabel={props.pending}>{props.submit}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
