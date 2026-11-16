import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { stableStringify } from "@/lib/crypto";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { parseRules, RiskRulesSchema, type RiskRules } from "@/lib/risk/rules";

export type RulesView = {
  rules: RiskRules;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
};

export async function getRules(actor: UserActor): Promise<RulesView> {
  assertCan(actor, "rules.read");
  const institutionId = tenantOf(actor);
  const row = await db.institutionConfiguration.findUnique({
    where: { institutionId },
    select: { riskRules: true, riskRulesVersion: true, updatedAt: true, updatedById: true },
  });
  if (!row) fail("NOT_FOUND", "Institution configuration is missing.");
  const updater = row.updatedById
    ? await db.user.findFirst({ where: { id: row.updatedById, institutionId }, select: { name: true } })
    : null;
  return {
    rules: parseRules(row.riskRules),
    version: row.riskRulesVersion,
    updatedAt: row.updatedAt,
    updatedByName: updater?.name ?? null,
  };
}

/**
 * Saves new triage rules. `input` is a full rule set (its `version` field is ignored: the next
 * version number is assigned here). `expectedVersion` rejects a save made from a stale form.
 * The PHQ-9 safety rule can never be switched off, and the audit entry lists only changed keys.
 */
export async function updateRules(
  actor: UserActor,
  input: unknown,
  expectedVersion?: number,
): Promise<{ version: number; changedKeys: string[] }> {
  assertCan(actor, "rules.configure");
  const institutionId = tenantOf(actor);

  const candidate = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const safety = candidate.phq9SafetyItem as { enabled?: unknown } | undefined;
  if (safety && safety.enabled !== true) fail("VALIDATION", "The PHQ-9 question 9 safety rule cannot be switched off.");

  const parsed = RiskRulesSchema.safeParse({ ...candidate, version: 1 });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` (${issue.path.join(" > ")})` : "";
    fail("VALIDATION", `Those rules are not valid${where}. Check the values and try again.`);
  }

  return db.$transaction(async (tx) => {
    const row = await tx.institutionConfiguration.findUnique({ where: { institutionId } });
    if (!row) fail("NOT_FOUND", "Institution configuration is missing.");
    if (expectedVersion !== undefined && expectedVersion !== row.riskRulesVersion) {
      fail("INVALID_TRANSITION", "The rules were changed by someone else while you were editing. Reload the page and review the current rules.");
    }
    const current = parseRules(row.riskRules);
    const next: RiskRules = { ...parsed.data, version: row.riskRulesVersion + 1 };

    const changedKeys = (Object.keys(next) as (keyof RiskRules)[])
      .filter((key) => key !== "version" && stableStringify(current[key]) !== stableStringify(next[key]))
      .map(String);
    if (changedKeys.length === 0) fail("VALIDATION", "Nothing has changed, so there is nothing to save.");

    const saved = await tx.institutionConfiguration.updateMany({
      where: { institutionId, riskRulesVersion: row.riskRulesVersion },
      data: { riskRules: JSON.parse(JSON.stringify(next)), riskRulesVersion: next.version, updatedById: actor.userId, updatedAt: now() },
    });
    if (saved.count !== 1) fail("INVALID_TRANSITION", "The rules were changed by someone else while you were saving. Reload and try again.");
    await recordAudit(tx, actor, {
      action: "rules.update",
      entityType: "InstitutionConfiguration",
      entityId: row.id,
      metadata: { version: next.version, changedKeys: changedKeys.join(",") },
    });
    return { version: next.version, changedKeys };
  });
}
