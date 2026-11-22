"use client";

import { useId } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, inputClass } from "@/components/ui/classes";

const REASONS = [
  { value: "SUPPORT", label: "Support" },
  { value: "CONFIGURATION", label: "Configuration" },
  { value: "SECURITY_REVIEW", label: "Security review" },
  { value: "OTHER", label: "Other" },
] as const;

function OpenButton({ switching }: { switching: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass("primary", "md", "w-full sm:w-auto")}>
      {pending ? "Opening workspace…" : switching ? "Switch workspace" : "Open workspace"}
    </button>
  );
}

export function OpenInstitutionForm({
  action,
  institutionId,
  institutionName,
  switching,
}: {
  action: (formData: FormData) => Promise<void>;
  institutionId: string;
  institutionName: string;
  switching: boolean;
}) {
  const id = useId();
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="institutionId" value={institutionId} />
      <label htmlFor={`${id}-reason`} className="grid min-w-0 gap-1.5 text-xs font-semibold text-ink-2">
        <span>Reason for access</span>
        <select id={`${id}-reason`} name="reason" aria-label={`Reason for opening ${institutionName}`} className={`${inputClass} min-w-0 pr-8`} required defaultValue="">
          <option value="" disabled>Choose a reason</option>
          {REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </select>
      </label>
      <OpenButton switching={switching} />
    </form>
  );
}
