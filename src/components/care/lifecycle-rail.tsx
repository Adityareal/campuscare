import { CheckCircleIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/classes";
import { When } from "@/components/ui";

export type LifecycleCase = {
  openedAt: Date;
  /** First linked alert or request, when earlier than the case itself. */
  receivedAt?: Date;
  acknowledgedAt: Date | null;
  reviewedAt: Date | null;
  contactedAt: Date | null;
  arrangedAt: Date | null;
  referredAt: Date | null;
  appointmentUpdatedAt: Date | null;
  followUpScheduledAt: Date | null;
  outcomeDocumentedAt: Date | null;
  closedAt: Date | null;
  returnedToMonitoringAt: Date | null;
  status: "OPEN" | "ACTIVE" | "MONITORING" | "CLOSED";
};

/** The case lifecycle as an ordered list. Each step shows when it happened or the word "pending",
 * so the state never depends on colour or icon alone. */
export function LifecycleRail({ c }: { c: LifecycleCase }) {
  const endedAt = c.status === "CLOSED" ? c.closedAt : c.status === "MONITORING" ? c.returnedToMonitoringAt : null;
  const steps: { label: string; at: Date | null }[] = [
    { label: "Request or alert received", at: c.receivedAt ?? c.openedAt },
    { label: "Acknowledged", at: c.acknowledgedAt },
    { label: "Human review", at: c.reviewedAt },
    { label: "Student contacted", at: c.contactedAt },
    { label: "Assessment or consultation arranged", at: c.arrangedAt },
    { label: "Referral initiated", at: c.referredAt },
    { label: "Appointment completed or updated", at: c.appointmentUpdatedAt },
    { label: "Follow-up scheduled", at: c.followUpScheduledAt },
    { label: "Outcome documented", at: c.outcomeDocumentedAt },
    { label: c.status === "MONITORING" ? "Returned to monitoring" : "Closed or returned to monitoring", at: endedAt },
  ];
  return (
    <ol aria-label="Case lifecycle" className="grid gap-0 sm:grid-cols-2 sm:gap-x-8">
      {steps.map((s) => (
        <li key={s.label} className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
          {s.at ? (
            <CheckCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
          ) : (
            <ClockIcon size={20} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          )}
          <div className="min-w-0">
            <p className={cx("text-sm", s.at ? "font-medium text-ink" : "text-ink-2")}>{s.label}</p>
            <p className="text-sm text-ink-3">{s.at ? <When date={s.at} /> : "Pending"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
