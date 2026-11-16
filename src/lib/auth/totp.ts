import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30-second steps, 6 digits), compatible
 * with common authenticator apps. Secrets are base32 (RFC 4648) and must be stored encrypted.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const code =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    (((mac[offset + 1] ?? 0) & 0xff) << 16) |
    (((mac[offset + 2] ?? 0) & 0xff) << 8) |
    ((mac[offset + 3] ?? 0) & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function counterAt(at: Date, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(at.getTime() / 1000 / stepSeconds);
}

export function totpAt(secretBase32: string, at: Date, digits = TOTP_DIGITS, stepSeconds = TOTP_STEP_SECONDS): string {
  return hotp(base32Decode(secretBase32), counterAt(at, stepSeconds), digits);
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Accepts a code for the current step or `window` steps either side (clock drift). Returns the
 * matched counter, or null. A counter at or below `lastCounter` is rejected, so a code that
 * was already used cannot be replayed. Store the returned counter as the new lastCounter.
 */
export function verifyTotp(secretBase32: string, code: string, at: Date, lastCounter: number | null, window = 1): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretBase32);
  const current = counterAt(at);
  for (let delta = -window; delta <= window; delta++) {
    const c = current + delta;
    if (c < 0 || (lastCounter !== null && c <= lastCounter)) continue;
    if (sameCode(hotp(secret, c), clean)) return c;
  }
  return null;
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** URI for authenticator apps (also usable for manual entry when no QR code is shown). */
export function otpauthUri(accountName: string, secretBase32: string, issuer = "CampusCare"): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
