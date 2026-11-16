"use client";

import { useActionState, useState } from "react";
import { ChoiceRow } from "@/components/student/choice";
import { Notice } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE, type ActionState } from "@/lib/action-state";

type ScopeKey = "CORE_PROCESSING" | "CARE_TEAM_REVIEW" | "AGGREGATE_ANALYTICS";

/** The three consent choices. Used for first-time onboarding and for later changes; the
 * server action decides where to go next. */
export function ConsentForm({
  action,
  initial,
  scopes,
  submitLabel,
  pendingLabel,
  coreRequiredText,
  dependsOnCoreText,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial: Record<ScopeKey, boolean>;
  scopes: { key: ScopeKey; title: string; body: string }[];
  submitLabel: string;
  pendingLabel: string;
  coreRequiredText: string;
  dependsOnCoreText: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const [choices, setChoices] = useState(initial);
  const coreOn = choices.CORE_PROCESSING;

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-3">
        {scopes.map((s) => {
          const dependent = s.key !== "CORE_PROCESSING";
          const disabled = dependent && !coreOn;
          return (
            <ChoiceRow
              key={s.key}
              type="checkbox"
              name={s.key}
              checked={dependent ? coreOn && choices[s.key] : choices[s.key]}
              disabled={disabled}
              onChange={(e) => setChoices((prev) => ({ ...prev, [s.key]: e.target.checked }))}
              label={<span className="font-medium">{s.title}</span>}
              hint={s.body}
            />
          );
        })}
      </div>
      {!coreOn ? (
        <Notice tone="warning" role="status">
          <p>{coreRequiredText}</p>
          <p className="mt-1">{dependsOnCoreText}</p>
        </Notice>
      ) : null}
      <ActionMessage state={state} />
      <div>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
