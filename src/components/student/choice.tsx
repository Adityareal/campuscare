import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/components/ui/classes";

/** A radio or checkbox inside a bordered row, 44px tall at least. The whole row is the click
 * target, and a checked row also gets an accent border and tint on top of the native control. */
export function ChoiceRow({
  type = "radio",
  label,
  hint,
  labelLang,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type" | "children"> & {
  type?: "radio" | "checkbox";
  label: ReactNode;
  hint?: ReactNode;
  labelLang?: string;
}) {
  return (
    <label
      className={cx(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line bg-surface px-3 py-2.5 hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        className,
      )}
    >
      <input type={type} className="mt-0.5 size-5 shrink-0 accent-accent" {...input} />
      <span className="min-w-0 text-[0.95rem]" lang={labelLang}>
        {label}
        {hint ? <span className="mt-0.5 block text-sm text-ink-3">{hint}</span> : null}
      </span>
    </label>
  );
}
