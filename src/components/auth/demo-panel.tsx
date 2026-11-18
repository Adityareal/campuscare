"use client";

import { useActionState } from "react";
import { demoSignInAction } from "@/app/sign-in/actions";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";

export type DemoPersonaOption = { key: string; label: string; name: string };

/** Shown only on a site marked CAMPUSCARE_DEPLOYMENT=demo. The server re-checks the setting and the demo flag on every use. */
export function DemoPanel({ personas }: { personas: DemoPersonaOption[] }) {
  const [state, formAction] = useActionState(demoSignInAction, IDLE);
  return (
    <section aria-labelledby="demo-heading" className="mt-10 grid gap-4 rounded-panel border border-line-input bg-surface-2 p-5" lang="en">
      <div>
        <h2 id="demo-heading" className="text-base font-semibold">
          Demo mode
        </h2>
        <p className="mt-1 text-sm text-ink-2">Sign in as a sample person to look around. These accounts use made-up data.</p>
      </div>
      <form action={formAction} className="grid gap-2">
        {personas.map((p) => (
          <SubmitButton key={p.key} name="persona" value={p.key} variant="secondary" className="w-full">
            Sign in as {p.label}: {p.name}
          </SubmitButton>
        ))}
      </form>
      <ActionMessage state={state} />
    </section>
  );
}
