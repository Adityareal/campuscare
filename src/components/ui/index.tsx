import Link from "next/link";
import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  EyeIcon,
  InfoIcon,
  WarningIcon,
  WarningOctagonIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { TriageCategory } from "@/generated/prisma/enums";
import { fmtDateTime } from "@/lib/format";
import { buttonClass, cx, inputClass, panelClass, tableCell, tableHeadCell, type ButtonSize, type ButtonVariant } from "@/components/ui/classes";

/*
 * Server-safe UI primitives. Client-only pieces live next to this file:
 *   submit-button.tsx (pending state), action-message.tsx (form result), nav-link.tsx (active nav).
 * Use cards (Panel) only where grouping carries meaning; otherwise rely on spacing and dividers.
 */

export { buttonClass, cx, inputClass, linkClass, panelClass, tableCell, tableHeadCell } from "@/components/ui/classes";

// ---------- Buttons ----------

type ButtonOwnProps = { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ComponentProps<"button"> & ButtonOwnProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & ButtonOwnProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---------- Forms ----------

/** Label above the control, hint and error below it. Pass the same id to the control. The hint
 * and error are linked to the control with aria-describedby, and an error sets aria-invalid. */
export function Field({
  id,
  label,
  hint,
  error,
  optionalLabel,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Shown after the label, e.g. dictionary "Optional". */
  optionalLabel?: string;
  children: ReactNode;
}) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter((x): x is string => !!x);
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optionalLabel ? <span className="ml-2 font-normal text-ink-3">{optionalLabel}</span> : null}
      </label>
      {describe(children, ids, !!error)}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-urgent-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type DescribableProps = { "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

function describe(children: ReactNode, ids: string[], invalid: boolean): ReactNode {
  if ((ids.length === 0 && !invalid) || !isValidElement<DescribableProps>(children)) return children;
  const merged = [...new Set([...(children.props["aria-describedby"]?.split(/\s+/) ?? []), ...ids].filter(Boolean))].join(" ");
  return cloneElement(children, {
    "aria-describedby": merged || undefined,
    ...(invalid ? { "aria-invalid": true as const } : {}),
  });
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-28 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "pr-8", className)} {...props} />;
}

/** A group of radio or checkbox options with a visible legend. */
export function Fieldset({ legend, hint, children, className }: { legend: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("grid gap-3", className)}>
      <legend className="mb-1 text-sm font-medium text-ink">{legend}</legend>
      {hint ? <p className="-mt-1 text-sm text-ink-3">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

// ---------- Layout ----------

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={16} aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[65ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cx(panelClass, "min-w-0", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx("px-5 py-4", bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

// ---------- Status ----------

const TRIAGE = {
  URGENT: { label: "Urgent", cls: "bg-urgent-soft text-urgent-text", Icon: WarningOctagonIcon },
  PRIORITY: { label: "Priority", cls: "bg-priority-soft text-priority-text", Icon: WarningIcon },
  MONITOR: { label: "Monitor", cls: "bg-monitor-soft text-monitor-text", Icon: EyeIcon },
  ROUTINE: { label: "Routine", cls: "bg-surface-2 text-ink-2", Icon: CheckCircleIcon },
} as const;

/** Operational triage label (never a diagnosis). Colour, icon and text together. */
export function TriageBadge({ category, size = "md" }: { category: TriageCategory; size?: "md" | "sm" }) {
  const t = TRIAGE[category];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        t.cls,
      )}
    >
      <t.Icon size={size === "sm" ? 13 : 15} weight="bold" aria-hidden />
      {t.label}
    </span>
  );
}

const PILL_TONE = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent-text",
  warning: "bg-priority-soft text-priority-text",
  danger: "bg-urgent-soft text-urgent-text",
  info: "bg-monitor-soft text-monitor-text",
} as const;

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof PILL_TONE }) {
  return <span className={cx("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium", PILL_TONE[tone])}>{children}</span>;
}

const NOTICE = {
  info: { cls: "bg-monitor-soft text-monitor-text", Icon: InfoIcon },
  warning: { cls: "bg-priority-soft text-priority-text", Icon: WarningIcon },
  danger: { cls: "bg-urgent-soft text-urgent-text", Icon: WarningOctagonIcon },
  success: { cls: "bg-accent-soft text-accent-text", Icon: CheckCircleIcon },
} as const;

/** Inline banner. Pass role="alert" only for something that must interrupt a screen reader. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  role,
  className,
}: {
  tone?: keyof typeof NOTICE;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  const n = NOTICE[tone];
  return (
    <div role={role} className={cx("flex gap-3 rounded-panel px-4 py-3", n.cls, className)}>
      <n.Icon size={20} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx(title ? "mt-0.5" : undefined)}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-line px-5 py-8">
      {icon ? <span className="text-ink-3">{icon}</span> : null}
      <div>
        <p className="font-medium">{title}</p>
        {children ? <p className="mt-1 max-w-[60ch] text-sm text-ink-3">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------- Data ----------

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx("grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4", className)}>{children}</dl>;
}

/** Use inside StatGrid. Numbers render in mono with tabular figures. */
export function Stat({ label, value, hint, tone = "default" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "default" | "urgent" | "priority" }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd
        className={cx(
          "font-mono text-2xl font-medium tracking-tight tabular-nums",
          tone === "urgent" && "text-urgent-text",
          tone === "priority" && "text-priority-text",
        )}
      >
        {value}
      </dd>
      {hint ? <dd className="text-sm text-ink-3">{hint}</dd> : null}
    </div>
  );
}

export function KeyValueList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)]", className)}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-sm text-ink-3">{it.label}</dt>
          <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Wrap rows in <thead>/<tbody> yourself and use the tableHeadCell / tableCell classes. */
export function Table({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("-mx-1 overflow-x-auto px-1", className)}>
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cx(tableHeadCell, className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx(tableCell, className)}>{children}</td>;
}

/** Institution-time timestamp with a machine-readable value. */
export function When({ date, children, className }: { date: Date; children?: ReactNode; className?: string }) {
  return (
    <time dateTime={date.toISOString()} className={cx("tabular-nums", className)}>
      {children ?? fmtDateTime(date)}
    </time>
  );
}

/** Case, alert and other short references (C-7K2QXM). */
export function Ref({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.85em] tracking-tight text-ink-2">{children}</span>;
}
