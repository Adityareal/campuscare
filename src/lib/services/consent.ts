import type { ConsentScope, Locale } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { sha256, stableStringify } from "@/lib/crypto";
import { runTx, type DbLike } from "@/lib/db";
import { en } from "@/lib/i18n/en";
import { hi } from "@/lib/i18n/hi";

/** Bump whenever the privacy copy changes; students are then asked to review their choices. */
export const CURRENT_POLICY_VERSION = "2026-11-v1";
export const CONSENT_SCOPES: ConsentScope[] = ["CORE_PROCESSING", "CARE_TEAM_REVIEW", "AGGREGATE_ANALYTICS"];

export function policyContentHash(): string {
  return sha256(stableStringify({ en: en.privacy, hi: hi.privacy }));
}

export async function ensureCurrentPolicy(client: DbLike): Promise<void> {
  await client.consentPolicy.upsert({
    where: { version: CURRENT_POLICY_VERSION },
    update: {},
    create: { version: CURRENT_POLICY_VERSION, effectiveAt: new Date("2026-11-01T00:00:00+05:30"), contentHash: policyContentHash() },
  });
}

export type ConsentState = Record<ConsentScope, boolean> & {
  policyVersion: string | null;
  /** True before onboarding or after the policy version changed. */
  needsReview: boolean;
  lastChangedAt: Date | null;
};

export async function getConsentState(client: DbLike, userId: string): Promise<ConsentState> {
  const rows = await client.consentRecord.findMany({
    where: { userId },
    orderBy: { recordedAt: "desc" },
    select: { scope: true, decision: true, policyVersion: true, recordedAt: true },
  });
  const latest = new Map<ConsentScope, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.scope)) latest.set(r.scope, r);
  const core = latest.get("CORE_PROCESSING");
  return {
    CORE_PROCESSING: core?.decision === "GRANTED",
    CARE_TEAM_REVIEW: latest.get("CARE_TEAM_REVIEW")?.decision === "GRANTED",
    AGGREGATE_ANALYTICS: latest.get("AGGREGATE_ANALYTICS")?.decision === "GRANTED",
    policyVersion: core?.policyVersion ?? null,
    needsReview: !core || core.policyVersion !== CURRENT_POLICY_VERSION,
    lastChangedAt: rows[0]?.recordedAt ?? null,
  };
}

export async function hasConsent(client: DbLike, userId: string, scope: ConsentScope): Promise<boolean> {
  const row = await client.consentRecord.findFirst({
    where: { userId, scope },
    orderBy: { recordedAt: "desc" },
    select: { decision: true },
  });
  return row?.decision === "GRANTED";
}

/** Appends a record for every scope whose decision changed, or for all scopes when the student
 * is confirming a new policy version. Records are never edited. */
export async function recordConsentChoices(
  actor: UserActor,
  choices: Record<ConsentScope, boolean>,
  source: "onboarding" | "privacy_settings",
  locale: Locale,
): Promise<ConsentState> {
  assertCan(actor, "consent.manage.own");
  const institutionId = tenantOf(actor);
  return runTx(async (tx) => {
    await ensureCurrentPolicy(tx);
    const current = await getConsentState(tx, actor.userId);
    const changed = CONSENT_SCOPES.filter((s) => current.needsReview || current[s] !== choices[s]);
    if (changed.length) {
      const recordedAt = now();
      await tx.consentRecord.createMany({
        data: changed.map((scope) => ({
          userId: actor.userId,
          institutionId,
          policyVersion: CURRENT_POLICY_VERSION,
          scope,
          decision: choices[scope] ? ("GRANTED" as const) : ("WITHDRAWN" as const),
          locale,
          source,
          recordedAt,
        })),
      });
      await recordAudit(tx, actor, {
        action: "consent.update",
        entityType: "ConsentRecord",
        entityId: actor.userId,
        metadata: {
          policyVersion: CURRENT_POLICY_VERSION,
          source,
          ...Object.fromEntries(changed.map((s) => [s, choices[s]])),
        },
      });
    }
    return getConsentState(tx, actor.userId);
  });
}
