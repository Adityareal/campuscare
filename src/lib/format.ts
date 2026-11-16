import { now } from "@/lib/clock";

/** All institution-facing dates render in the institution's time zone (India for the pilot). */
export const INSTITUTION_TZ = "Asia/Kolkata";

const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: INSTITUTION_TZ });
const dayMonthYear = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: INSTITUTION_TZ });
const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: INSTITUTION_TZ });
const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: INSTITUTION_TZ });
const hiDayMonth = new Intl.DateTimeFormat("hi-IN", { day: "numeric", month: "long", timeZone: INSTITUTION_TZ });
const hiWeekday = new Intl.DateTimeFormat("hi-IN", { weekday: "long", day: "numeric", month: "long", timeZone: INSTITUTION_TZ });
const hiTime = new Intl.DateTimeFormat("hi-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: INSTITUTION_TZ });

export function fmtDay(d: Date, locale: "en" | "hi" = "en"): string {
  return (locale === "hi" ? hiDayMonth : dayMonth).format(d);
}
export function fmtDate(d: Date): string {
  return dayMonthYear.format(d);
}
export function fmtTime(d: Date, locale: "en" | "hi" = "en"): string {
  return (locale === "hi" ? hiTime : time).format(d);
}
export function fmtWeekday(d: Date, locale: "en" | "hi" = "en"): string {
  return (locale === "hi" ? hiWeekday : weekday).format(d);
}
export function fmtDateTime(d: Date): string {
  return `${dayMonthYear.format(d)}, ${time.format(d)}`;
}

/** "3 h 20 min", "2 days" etc. for SLA and response-time displays. */
export function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export function relativeToNow(d: Date, at: Date = now()): string {
  const diff = d.getTime() - at.getTime();
  return diff >= 0 ? `in ${fmtDuration(diff)}` : `${fmtDuration(diff)} ago`;
}

/** Calendar date string (YYYY-MM-DD) of an instant in the institution time zone. */
export function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: INSTITUTION_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Interprets "YYYY-MM-DD" + "HH:MM" as India Standard Time (UTC+05:30, no DST). */
export function istToUtc(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00+05:30`);
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
