"use client";

import { useActionState, type ReactNode } from "react";
import { ActionMessage } from "@/components/ui/action-message";
import { IDLE, type ActionState } from "@/lib/action-state";

/** A form bound to a Server Action with its result message shown below the controls. */
export function ActionForm({
  action,
  children,
  successText,
  className = "grid gap-4",
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  successText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form action={formAction} className={className}>
      {children}
      <ActionMessage state={state} successText={successText} />
    </form>
  );
}
