import { fail } from "@/lib/errors";
import { istToUtc } from "@/lib/format";

/** Reads a date (YYYY-MM-DD) and a time (HH:MM) typed in India Standard Time into an instant. */
export function parseIstDateTime(day: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) fail("VALIDATION", "Choose a valid date and time.");
  const at = istToUtc(day, time);
  if (Number.isNaN(at.getTime())) fail("VALIDATION", "Choose a valid date and time.");
  return at;
}

export function pickOne<T extends string>(value: string, allowed: readonly T[], message: string): T {
  const match = allowed.find((a) => a === value);
  if (!match) fail("VALIDATION", message);
  return match;
}
