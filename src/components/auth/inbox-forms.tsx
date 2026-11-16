"use client";

import { useActionState } from "react";
import { markAllReadAction, openNotificationAction } from "@/app/notifications/actions";
import { ActionMessage } from "@/components/ui/action-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";

/** Opens a notification: marks it read and follows its link when it has one. */
export function OpenNotificationForm({ id, label, variant }: { id: string; label: string; variant: "primary" | "secondary" }) {
  const [state, formAction] = useActionState(openNotificationAction, IDLE);
  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function MarkAllReadForm({ label }: { label: string }) {
  const [state, formAction] = useActionState(markAllReadAction, IDLE);
  return (
    <form action={formAction} className="grid gap-2">
      <SubmitButton variant="secondary">{label}</SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
