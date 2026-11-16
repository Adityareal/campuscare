import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";

const VERSION = "v1";

function fieldKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set. See .env.example.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, each part base64url. */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(payload: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("Unrecognised ciphertext format.");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptOptional(plain: string | null | undefined): string | null {
  const trimmed = plain?.trim();
  return trimmed ? encryptField(trimmed) : null;
}

export function decryptOptional(payload: string | null | undefined): string | null {
  return payload ? decryptField(payload) : null;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// No 0/O/1/I so references can be read aloud over the phone without confusion.
const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function shortReference(prefix: string, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `${prefix}-${out}`;
}

/** JSON with recursively sorted keys, so hashes survive jsonb key reordering. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
