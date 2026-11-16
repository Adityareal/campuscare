"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChoiceRow } from "@/components/student/choice";
import { Field, Fieldset, Textarea } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { requestHelpAction } from "@/app/student/help/actions";

export type HelpFormLabels = {
  legend: string;
  types: { value: string; label: string }[];
  detailsLabel: string;
  optional: string;
  submit: string;
  pending: string;
  urgentLink: string;
};

/** Help request form. Choosing "Urgent support" here files the same request as the button on
 * the Get help now page; the link below it is for people who need a phone number instead. */
export function HelpForm({ labels }: { labels: HelpFormLabels }) {
  const [state, formAction] = useActionState(requestHelpAction, IDLE);

  return (
    <form action={formAction} className="grid gap-6">
      <Fieldset legend={labels.legend}>
        <div className="grid gap-2 sm:grid-cols-2">
          {labels.types.map((type, i) => (
            <ChoiceRow key={type.value} name="type" value={type.value} label={type.label} required={i === 0} />
          ))}
        </div>
      </Fieldset>

      <Field id="details" label={labels.detailsLabel} optionalLabel={labels.optional}>
        <Textarea id="details" name="details" maxLength={2000} rows={5} />
      </Field>

      <div className="grid gap-3">
        <ActionMessage state={state} />
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pendingLabel={labels.pending}>{labels.submit}</SubmitButton>
          <Link href="/help-now" className="font-medium text-accent-text underline underline-offset-4">
            {labels.urgentLink}
          </Link>
        </div>
      </div>
    </form>
  );
}
