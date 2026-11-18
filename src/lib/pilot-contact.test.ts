import "@/test/env";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pilotContactMailto } from "@/lib/pilot-contact";

const env = process.env as Record<string, string | undefined>;
let saved: string | undefined;
beforeEach(() => {
  saved = env.PILOT_CONTACT_EMAIL;
});
afterEach(() => {
  if (saved === undefined) delete env.PILOT_CONTACT_EMAIL;
  else env.PILOT_CONTACT_EMAIL = saved;
});

function link(value: string | undefined): string | null {
  if (value === undefined) delete env.PILOT_CONTACT_EMAIL;
  else env.PILOT_CONTACT_EMAIL = value;
  return pilotContactMailto();
}

describe("pilotContactMailto", () => {
  it("builds an encoded mailto link for one plain address, trimming and keeping the address", () => {
    expect(link("  pilots@Campus-Care.in ")).toBe("mailto:pilots@Campus-Care.in?subject=Request%20a%20CampusCare%20pilot");
    expect(link("a.b+c@mail.university.ac.in")).toBe("mailto:a.b+c@mail.university.ac.in?subject=Request%20a%20CampusCare%20pilot");
  });

  it("returns null when unset or blank", () => {
    expect(link(undefined)).toBeNull();
    expect(link("")).toBeNull();
    expect(link("   ")).toBeNull();
  });

  it.each([
    "x@example.com",
    "x@EXAMPLE.NET",
    "x@mail.example.org",
    "x@campus.example",
    "x@campus.test",
    "x@campus.invalid",
    "x@campus.localhost",
    "x@campus.local",
    "x@campus.internal",
  ])("rejects the reserved or private host in %s", (v) => {
    expect(link(v)).toBeNull();
  });

  it.each(["x@10.0.0.1", "x@[::1]", "x@[10.0.0.1]", "x@localhost", "x@intranet", "notanaddress", "@campus.in", "x@"])(
    "rejects IP literals, single-label hosts and malformed input: %s",
    (v) => {
      expect(link(v)).toBeNull();
    },
  );

  it.each([
    ["space", "a b@campus.in"],
    ["comma", "a@campus.in,b@campus.in"],
    ["semicolon", "a@campus.in;b@campus.in"],
    ["question mark", "a@campus.in?cc=b@campus.in"],
    ["ampersand", "a@campus.in&bcc=b@campus.in"],
    ["percent", "a%0d@campus.in"],
    ["less-than", "<a@campus.in>"],
    ["greater-than", "a@campus.in>"],
    ["double quote", '"a"@campus.in'],
    ["single quote", "a'b@campus.in"],
    ["CR", "a@campus.in\rBcc: b@campus.in"],
    ["LF", "a@campus.in\nBcc: b@campus.in"],
  ])("rejects an address containing %s", (_name, v) => {
    expect(link(v)).toBeNull();
  });
});
