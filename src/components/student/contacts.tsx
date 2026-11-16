import { PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/classes";
import { fill } from "@/lib/i18n";
import type { CrisisContact } from "@/lib/services/config";

/** A dialable href from a display number such as "1-800-891-4416". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * Phone numbers as tap-to-call links. `large` is for crisis lines on /help-now, where the
 * number is the main thing on the page.
 */
export function ContactLinks({
  contacts,
  callAria,
  hoursLabel,
  large = false,
}: {
  contacts: CrisisContact[];
  /** Template with {label} and {phone}. */
  callAria: string;
  /** Template with {hours}. */
  hoursLabel: string;
  large?: boolean;
}) {
  return (
    <ul className="grid gap-3">
      {contacts.map((c) => (
        <li key={`${c.label}-${c.phone}`}>
          <a
            href={telHref(c.phone)}
            aria-label={fill(callAria, { label: c.label, phone: c.phone })}
            className={cx(
              "flex items-center gap-4 rounded-control border border-line bg-surface px-4 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              large ? "min-h-20 py-4" : "min-h-14 py-3",
            )}
          >
            <PhoneIcon size={large ? 30 : 22} weight="bold" className="shrink-0 text-accent-text" aria-hidden />
            <span className="min-w-0">
              <span className={cx("block font-mono font-semibold tabular-nums tracking-tight", large ? "text-3xl" : "text-lg")}>{c.phone}</span>
              <span className="block text-sm text-ink-2">{c.label}</span>
              {c.hours ? <span className="block text-sm text-ink-3">{fill(hoursLabel, { hours: c.hours })}</span> : null}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
