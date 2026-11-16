"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import { requestUrgentContactAction } from "@/app/help-now/actions";

/** Button for a signed-in student to ask the campus team for urgent contact. */
export function UrgentRequest({ label, pending }: { label: string; pending: string }) {
  const [state, formAction] = useActionState(requestUrgentContactAction, IDLE);
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
