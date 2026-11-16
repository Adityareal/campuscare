import "@/test/env";
import { afterEach, describe, expect, it } from "vitest";
import { decryptField, decryptOptional, encryptField, encryptOptional, sha256, shortReference, stableStringify } from "@/lib/crypto";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;

afterEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

/** Flips one byte inside the base64url part at `index` of a v1 payload. */
function tamper(payload: string, index: 1 | 2 | 3): string {
  const parts = payload.split(".");
  const buf = Buffer.from(parts[index] ?? "", "base64url");
  buf[0] = (buf[0] ?? 0) ^ 0x01;
  parts[index] = buf.toString("base64url");
  return parts.join(".");
}

describe("field encryption", () => {
  it("round-trips English and Hindi text", () => {
    for (const text of ["Exams next week, not sleeping well.", "मुझे परीक्षा की चिंता है।", ""]) {
      expect(decryptField(encryptField(text))).toBe(text);
    }
  });

  it("uses the v1 format and never contains the plaintext", () => {
    const text = "I have been feeling low this week";
    const ct = encryptField(text);
    expect(ct.startsWith("v1.")).toBe(true);
    expect(ct.split(".")).toHaveLength(4);
    expect(ct).not.toContain("feeling");
  });

  it("uses a fresh random IV for every encryption", () => {
    const a = encryptField("same text");
    const b = encryptField("same text");
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
    expect(Buffer.from(a.split(".")[1] ?? "", "base64url")).toHaveLength(12);
  });

  it("throws when the ciphertext, tag or IV was tampered with", () => {
    const ct = encryptField("tamper test");
    expect(() => decryptField(tamper(ct, 3))).toThrow();
    expect(() => decryptField(tamper(ct, 2))).toThrow();
    expect(() => decryptField(tamper(ct, 1))).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decryptField("v2.a.b.c")).toThrow(/Unrecognised/);
    expect(() => decryptField("not-a-payload")).toThrow(/Unrecognised/);
  });

  it("throws when the key has the wrong length or is missing", () => {
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptField("x")).toThrow(/32 bytes/);
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encryptField("x")).toThrow(/not set/);
  });

  it("cannot decrypt with a different key", () => {
    const ct = encryptField("secret");
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptField(ct)).toThrow();
  });

  it("optional helpers store nothing for blank input", () => {
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional(undefined)).toBeNull();
    expect(encryptOptional("   ")).toBeNull();
    expect(decryptOptional(encryptOptional("  trimmed  "))).toBe("trimmed");
    expect(decryptOptional(null)).toBeNull();
  });
});

describe("stableStringify", () => {
  it("sorts keys recursively so key order does not matter", () => {
    const a = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } };
    const b = { a: { c: "x", d: [3, { y: 2, z: 1 }] }, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("keeps array order, drops undefined properties and handles scalars", () => {
    expect(stableStringify([2, 1])).toBe("[2,1]");
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
  });
});

describe("hashing and references", () => {
  it("sha256 matches the standard test vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("short references avoid ambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(shortReference("A")).toMatch(/^A-[2-9A-HJ-NP-Z]{6}$/);
  });
});
