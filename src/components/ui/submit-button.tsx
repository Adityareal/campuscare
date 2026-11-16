"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/classes";

/** Submit button that disables itself while its form's Server Action is running. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  disabled,
  ...rest
}: ComponentProps<"button"> & { pendingLabel?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
