import { z } from "zod";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { decryptOptional, encryptOptional } from "@/lib/crypto";
import { db, runTx } from "@/lib/db";
import { fail } from "@/lib/errors";
import { evaluateAfterCommit } from "@/lib/services/access";
import { hasConsent } from "@/lib/services/consent";
import { createHelpRequestIn } from "@/lib/services/help";

const scale = z.number().int().min(1).max(5).nullable();

export const CheckInSchema = z.object({
  mood: scale,
  stress: scale,
  sleep: scale,
  energy: scale,
  social: scale,
  academicPressure: scale,
  wantsToTalk: z.enum(["NO", "NOT_NOW", "YES"]).nullable(),
  note: z.string().max(1000).nullable(),
});

export type CheckInInput = z.infer<typeof CheckInSchema>;

export const CHECKIN_FIELDS = ["mood", "stress", "sleep", "energy", "social", "academicPressure"] as const;

export async function submitCheckIn(actor: UserActor, raw: CheckInInput): Promise<{ checkInId: string; requestedContact: boolean }> {
  assertCan(actor, "checkin.create");
  const institutionId = tenantOf(actor);
  const parsed = CheckInSchema.safeParse(raw);
  if (!parsed.success) fail("VALIDATION", "Some answers were out of range.");
  const input = parsed.data;
  if (CHECKIN_FIELDS.every((f) => input[f] === null) && !input.wantsToTalk && !input.note?.trim()) {
    fail("VALIDATION", "Answer at least one question to save a check-in.");
  }
  if (!(await hasConsent(db, actor.userId, "CORE_PROCESSING"))) fail("CONSENT_REQUIRED", "Review your privacy choices first.");

  const result = await runTx(async (tx) => {
    const checkIn = await tx.checkIn.create({
      data: {
        institutionId,
        studentId: actor.userId,
        mood: input.mood,
        stress: input.stress,
        sleep: input.sleep,
        energy: input.energy,
        social: input.social,
        academicPressure: input.academicPressure,
        wantsToTalk: input.wantsToTalk,
        noteCiphertext: encryptOptional(input.note),
        locale: actor.locale,
        createdAt: now(),
      },
    });
    if (input.wantsToTalk === "YES") {
      await createHelpRequestIn(tx, { institutionId, studentId: actor.userId, type: "GENERAL_SUPPORT", origin: "check_in" });
    }
    // Audit records that a check-in happened, never what was answered.
    await recordAudit(tx, actor, { action: "checkin.create", entityType: "CheckIn", entityId: checkIn.id });
    return { checkInId: checkIn.id, requestedContact: input.wantsToTalk === "YES" };
  });
  await evaluateAfterCommit(actor.userId, institutionId, "check_in");
  return result;
}

export async function listOwnCheckIns(actor: UserActor, limit = 60) {
  assertCan(actor, "own.history.read");
  const rows = await db.checkIn.findMany({
    where: { studentId: actor.userId, institutionId: tenantOf(actor) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({ ...r, note: decryptOptional(r.noteCiphertext) }));
}
