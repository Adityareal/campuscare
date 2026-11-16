"use client";

import { useActionState } from "react";
import { revokeSessionAction } from "@/app/account/actions";
import { changePasswordAction, confirmEnrolmentAction, startEnrolmentAction } from "@/app/account/security/actions";
import { Field, Input } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";

export function StartEnrolmentForm() {
  const [state, formAction] = useActionState(startEnrolmentAction, IDLE);
  return (
    <form action={formAction} className="grid max-w-md gap-3">
      <SubmitButton pendingLabel="Starting" className="w-fit">
        Start setup
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmEnrolmentForm() {
  const [state, formAction] = useActionState(confirmEnrolmentAction, IDLE);
  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <Field id="enrol-code" label="6-digit code from your app" hint="Codes change every 30 seconds.">
        <Input
          id="enrol-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          aria-describedby="enrol-code-hint"
          className="font-mono tracking-[0.3em] tabular-nums"
        />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton pendingLabel="Checking" className="w-fit">
        Turn on second step
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [state, formAction] = useActionState(changePasswordAction, IDLE);
  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <Field id="current" label="Current password">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field id="next" label="New password" hint={`At least ${minLength} characters.`}>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={minLength} required aria-describedby="next-hint" />
      </Field>
      <Field id="confirm" label="Confirm new password">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={minLength} required />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton pendingLabel="Saving" className="w-fit">
        Change password
      </SubmitButton>
    </form>
  );
}

export function RevokeSessionForm({ sessionId, current }: { sessionId: string; current: boolean }) {
  const [state, formAction] = useActionState(revokeSessionAction, IDLE);
  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Ending">
        {current ? "Sign out here" : "End session"}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
