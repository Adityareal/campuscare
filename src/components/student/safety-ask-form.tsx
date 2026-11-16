"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { requestSafetyContactAction } from "@/app/student/assessments/[id]/actions";

/** The student's own button asking the campus team to contact them. */
export function SafetyAskForm({ label, pending }: { label: string; pending: string }) {
  const [state, formAction] = useActionState(requestSafetyContactAction, IDLE);
  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <SubmitButton pendingLabel={pending} disabled={state.status === "ok"}>
          {label}
        </SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
