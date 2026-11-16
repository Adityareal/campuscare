"use client";

import type { ActionState } from "@/lib/action-state";

/** Shows the result of a Server Action returned through useActionState. Errors are announced
 * immediately (role="alert"); confirmations politely (role="status"). */
export function ActionMessage({ state, successText }: { state: ActionState; successText?: string }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <p role="alert" className="rounded-control bg-urgent-soft px-3 py-2 text-sm font-medium text-urgent-text">
        {state.message ?? "Something went wrong. Please try again."}
      </p>
    );
  }
  const text = state.message ?? successText;
  if (!text) return null;
  return (
    <p role="status" className="rounded-control bg-accent-soft px-3 py-2 text-sm font-medium text-accent-text">
      {text}
    </p>
  );
}
