"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/sign-in/actions";
import { Field, Input } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import type { AccessCopy } from "@/lib/i18n/access";

export function SignInForm({ copy, lang }: { copy: AccessCopy["signIn"]; lang: "en" | "hi" }) {
  const [state, formAction] = useActionState(signInAction, IDLE);
  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="lang" value={lang} />
      <Field id="email" label={copy.email}>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" required autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field id="password" label={copy.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton pendingLabel={copy.pending} className="w-full">
        {copy.submit}
      </SubmitButton>
    </form>
  );
}
