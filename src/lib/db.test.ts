import "@/test/env";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, retryDelayMs, runTx, type Db } from "@/lib/db";

function knownError(code: string, message = "boom", meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "test", meta });
}

/** A client whose $transaction fails with the given errors in order, then runs the callback. */
function clientFailing(errors: unknown[]) {
  let calls = 0;
  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      calls += 1;
      const error = errors.shift();
      if (error) throw error;
      return fn({});
    },
  } as unknown as Db;
  return { client, calls: () => calls };
}

describe("runTx", () => {
  it("re-runs the transaction after a write conflict (P2034)", async () => {
    const { client, calls } = clientFailing([knownError("P2034")]);
    await expect(runTx(async () => "ok", client)).resolves.toBe("ok");
    expect(calls()).toBe(2);
  });

  it("gives up after MAX_ATTEMPTS attempts", async () => {
    const { client, calls } = clientFailing(Array.from({ length: MAX_ATTEMPTS + 1 }, () => knownError("P2034")));
    await expect(runTx(async () => "ok", client)).rejects.toMatchObject({ code: "P2034" });
    expect(calls()).toBe(MAX_ATTEMPTS);
  });

  it("backs off exponentially from 20 ms, capped at 1 s, with full jitter", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => retryDelayMs(n, () => 1))).toEqual([20, 40, 80, 160, 320, 640, 1000, 1000]);
    expect(retryDelayMs(5, () => 0)).toBe(0);
    expect(retryDelayMs(5, () => 0.5)).toBe(160);
  });

  it("retries a unique violation on the audit chain", async () => {
    const { client, calls } = clientFailing([knownError("P2002", "Unique constraint failed on the constraint: `AuditLog_chain_seq_key`")]);
    await expect(runTx(async () => "ok", client)).resolves.toBe("ok");
    expect(calls()).toBe(2);
  });

  it("does not retry any other unique violation or error", async () => {
    const dup = clientFailing([knownError("P2002", "Unique constraint failed on the constraint: `User_email_key`")]);
    await expect(runTx(async () => "ok", dup.client)).rejects.toMatchObject({ code: "P2002" });
    expect(dup.calls()).toBe(1);
    const other = clientFailing([new Error("nope")]);
    await expect(runTx(async () => "ok", other.client)).rejects.toThrow("nope");
    expect(other.calls()).toBe(1);
  });
});
