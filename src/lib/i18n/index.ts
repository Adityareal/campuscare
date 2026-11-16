import type { Locale } from "@/generated/prisma/enums";
import { en, type Dictionary } from "@/lib/i18n/en";
import { hi } from "@/lib/i18n/hi";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { en, hi };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

/** Replaces {placeholders}. Unknown placeholders are left visible so gaps show up in review. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

export const HTML_LANG: Record<Locale, string> = { en: "en-IN", hi: "hi-IN" };
