"use client";

import { useActionState } from "react";
import { setPasswordAction } from "@/app/set-password/actions";
import { Field, Input } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";

export function SetPasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const [state, formAction] = useActionState(setPasswordAction, IDLE);
  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" hint={`At least ${minLength} characters.`}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={minLength} required aria-describedby="password-hint" />
      </Field>
      <Field id="confirm" label="Confirm new password">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={minLength} required />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton pendingLabel="Saving" className="w-full">
        Set password
      </SubmitButton>
    </form>
  );
}
