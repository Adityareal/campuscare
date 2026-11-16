"use client";

import { useActionState } from "react";
import { verifyAction } from "@/app/sign-in/actions";
import { Field, Input } from "@/components/ui";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import type { AccessCopy } from "@/lib/i18n/access";

export function VerifyForm({ copy, lang }: { copy: AccessCopy["verify"]; lang: "en" | "hi" }) {
  const [state, formAction] = useActionState(verifyAction, IDLE);
  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="lang" value={lang} />
      <Field id="code" label={copy.code}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          className="font-mono text-lg tracking-[0.3em] tabular-nums"
        />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton pendingLabel={copy.pending} className="w-full">
        {copy.submit}
      </SubmitButton>
    </form>
  );
}
