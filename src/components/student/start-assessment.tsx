"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { startAssessmentAction } from "@/app/student/actions";

/** Two buttons in one form: the pressed button's name and value tell the action which
 * questionnaire to open. */
export function StartAssessment({ phq9Label, gad7Label, pending }: { phq9Label: string; gad7Label: string; pending: string }) {
  const [state, formAction] = useActionState(startAssessmentAction, IDLE);
  return (
    <form action={formAction} className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="instrument" value="PHQ9" variant="secondary" pendingLabel={pending}>
          {phq9Label}
        </SubmitButton>
        <SubmitButton name="instrument" value="GAD7" variant="secondary" pendingLabel={pending}>
          {gad7Label}
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
