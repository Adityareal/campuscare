"use client";

import { useActionState, type ReactNode } from "react";
import { ActionMessage } from "@/components/ui/action-message";
import { cx, type ButtonSize, type ButtonVariant } from "@/components/ui/classes";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE, type ActionState } from "@/lib/action-state";

export type CareAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * A Server Action form with a pending button and the result message below it. Fields and
 * hidden inputs are passed as children from the server page.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant = "primary",
  size = "md",
  successText,
  className,
  children,
}: {
  action: CareAction;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  successText?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form action={formAction} className={cx("grid gap-4", className)}>
      {children}
      <div>
        <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel ?? "Saving..."}>
          {submitLabel}
        </SubmitButton>
      </div>
      <ActionMessage state={state} successText={successText} />
    </form>
  );
}
