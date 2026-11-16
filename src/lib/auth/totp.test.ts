import "@/test/env";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, counterAt, generateTotpSecret, hotp, otpauthUri, totpAt, verifyTotp } from "@/lib/auth/totp";

/** RFC 6238 appendix B SHA1 seed, ASCII "12345678901234567890". */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const at = (seconds: number): Date => new Date(seconds * 1000);

describe("base32", () => {
  it("decodes the RFC 6238 seed", () => {
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe("12345678901234567890");
    expect(base32Encode(Buffer.from("12345678901234567890", "ascii"))).toBe(RFC_SECRET);
  });

  it("round-trips random secrets and tolerates spacing and lower case", () => {
    const buf = randomBytes(20);
    const enc = base32Encode(buf);
    expect(base32Decode(enc).equals(buf)).toBe(true);
    expect(base32Decode(enc.toLowerCase().replace(/(.{4})/g, "$1 ")).equals(buf)).toBe(true);
    expect(() => base32Decode("ABC1")).toThrow();
  });

  it("generates 20-byte secrets", () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });
});

describe("RFC 6238 SHA1 vectors (6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
  ])("T=%is gives %s", (seconds, code) => {
    expect(totpAt(RFC_SECRET, at(seconds))).toBe(code);
  });

  it("hotp uses 30-second counters", () => {
    expect(counterAt(at(59))).toBe(1);
    expect(hotp(base32Decode(RFC_SECRET), 1)).toBe("287082");
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and returns its counter", () => {
    expect(verifyTotp(RFC_SECRET, "287082", at(59), null)).toBe(1);
    expect(verifyTotp(RFC_SECRET, "287 082", at(59), null)).toBe(1);
  });

  it("rejects a replayed code through lastCounter", () => {
    const counter = verifyTotp(RFC_SECRET, "287082", at(59), null);
    expect(counter).toBe(1);
    expect(verifyTotp(RFC_SECRET, "287082", at(59), counter)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "287082", at(59), 5)).toBeNull();
  });

  it("allows one step of clock drift either side and no more", () => {
    // Code for counter 1 (T 30..59s).
    expect(verifyTotp(RFC_SECRET, "287082", at(89), null)).toBe(1);
    expect(verifyTotp(RFC_SECRET, "287082", at(29), null)).toBe(1);
    expect(verifyTotp(RFC_SECRET, "287082", at(119), null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "287082", at(119), null, 2)).toBe(1);
  });

  it("rejects malformed and wrong codes", () => {
    expect(verifyTotp(RFC_SECRET, "28708", at(59), null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "28708a", at(59), null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "000000", at(59), null)).toBeNull();
  });
});

describe("otpauthUri", () => {
  it("describes a SHA1, 6-digit, 30-second token", () => {
    const uri = otpauthUri("asha@test.example", RFC_SECRET);
    expect(uri.startsWith("otpauth://totp/CampusCare%3Aasha%40test.example?")).toBe(true);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain("algorithm=SHA1&digits=6&period=30");
  });
});
