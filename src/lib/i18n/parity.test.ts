import "@/test/env";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { fill } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { hi } from "@/lib/i18n/hi";

/** Flattens a dictionary into "path" -> shape, where a string's shape is its sorted
 * {placeholder} set, so both languages must agree on keys and placeholders. */
function shape(value: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof value === "string") {
    const names = [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    out.set(prefix, `string{${names.join(",")}}`);
  } else if (Array.isArray(value)) {
    out.set(prefix, `array(${value.length})`);
    value.forEach((v, i) => shape(v, `${prefix}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) shape(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, typeof value);
  }
  return out;
}

function mismatches(a: unknown, b: unknown): string[] {
  const sa = shape(a);
  const sb = shape(b);
  const problems: string[] = [];
  for (const [k, v] of sa) {
    if (!sb.has(k)) problems.push(`missing in hi: ${k}`);
    else if (sb.get(k) !== v) problems.push(`differs at ${k}: en ${v}, hi ${sb.get(k)}`);
  }
  for (const k of sb.keys()) if (!sa.has(k)) problems.push(`missing in en: ${k}`);
  return problems;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

describe("i18n parity", () => {
  it("the shared dictionaries have identical keys and placeholders", () => {
    expect(mismatches(en, hi)).toEqual([]);
  });

  it("every { en, hi } copy file has identical keys and placeholders", async () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !["en.ts", "hi.ts", "index.ts"].includes(f));
    const covered: string[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as Record<string, unknown>;
      for (const [name, value] of Object.entries(mod)) {
        if (!isObject(value) || !isObject(value.en) || !isObject(value.hi)) continue;
        covered.push(`${file}:${name}`);
        problems.push(...mismatches(value.en, value.hi).map((p) => `${file}:${name}: ${p}`));
      }
    }
    expect(problems).toEqual([]);
    for (const known of ["access.ts:accessCopy", "care.ts:care", "messages.ts:messagesCopy", "student.ts:studentCopy"]) {
      expect(covered).toContain(known);
    }
  });
});

describe("fill", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    expect(fill("Hello, {name}. {count} new", { name: "Asha", count: 3 })).toBe("Hello, Asha. 3 new");
    expect(fill("Hello, {name}", {})).toBe("Hello, {name}");
  });
});
