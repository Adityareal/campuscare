"use client";

import { useActionState, useState, type ReactNode } from "react";
import { ActionMessage } from "@/components/ui/action-message";
import { cx, inputClass } from "@/components/ui/classes";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE } from "@/lib/action-state";
import type { CareAction } from "@/components/care/action-form";

type Option = { value: string; label: string };

function ClientField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Records one crisis-protocol contact attempt. The responder picker only shows for the on-call
 * target and the service name only for an outside service. */
export function EscalationAttemptForm({
  action,
  alertId,
  targets,
  channels,
  outcomes,
  responders,
  defaultResponderId,
}: {
  action: CareAction;
  alertId: string;
  targets: Option[];
  channels: Option[];
  outcomes: Option[];
  responders: Option[];
  defaultResponderId: string | null;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const [target, setTarget] = useState(targets[0]?.value ?? "ON_CALL");
  const selectClass = cx(inputClass, "pr-8");
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="alertId" value={alertId} />
      <div className="grid gap-4 md:grid-cols-3">
        <ClientField id="esc-target" label="Who you tried to reach">
          <select id="esc-target" name="target" className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </ClientField>
        <ClientField id="esc-channel" label="How">
          <select id="esc-channel" name="channel" className={selectClass} defaultValue={channels[0]?.value}>
            {channels.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </ClientField>
        <ClientField id="esc-outcome" label="What happened">
          <select id="esc-outcome" name="outcome" className={selectClass} defaultValue={outcomes[0]?.value}>
            {outcomes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </ClientField>
      </div>
      {target === "ON_CALL" ? (
        <ClientField id="esc-responder" label="Responder">
          <select id="esc-responder" name="targetUserId" className={selectClass} defaultValue={defaultResponderId ?? ""} required>
            <option value="" disabled>
              Choose a responder
            </option>
            {responders.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </ClientField>
      ) : null}
      {target === "EXTERNAL_SERVICE" ? (
        <ClientField id="esc-label" label="Service name" hint="For example: campus security or a hospital emergency department.">
          <input id="esc-label" name="targetLabel" className={inputClass} maxLength={120} required aria-describedby="esc-label-hint" />
        </ClientField>
      ) : null}
      <ClientField id="esc-note" label="Note (optional)" hint="Stored encrypted. Visible to the care team only.">
        <textarea id="esc-note" name="note" className={cx(inputClass, "min-h-28 resize-y")} maxLength={2000} aria-describedby="esc-note-hint" />
      </ClientField>
      <div>
        <SubmitButton pendingLabel="Recording...">Record attempt</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
