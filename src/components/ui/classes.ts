/** Class-name helpers shared by server and client components (no JSX, no icons). */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[background-color,color,transform,opacity] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const BUTTON_VARIANT = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "border border-line-input bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-urgent text-urgent-ink hover:opacity-90",
} as const;

// md is a 44px touch target (WCAG 2.2 target size, comfortably above the 24px minimum).
const BUTTON_SIZE = {
  md: "h-11 px-4 text-[0.95rem]",
  sm: "h-9 px-3 text-sm",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string): string {
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], extra);
}

export const inputClass =
  "block w-full rounded-control border border-line-input bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-urgent disabled:opacity-60";

export const panelClass = "rounded-panel border border-line bg-surface";

export const linkClass = "font-medium text-accent-text underline decoration-1 underline-offset-4 hover:decoration-2";

export const tableHeadCell = "border-b border-line px-3 py-2.5 text-left text-sm font-medium text-ink-3";
export const tableCell = "border-b border-line px-3 py-3 align-top text-sm";
