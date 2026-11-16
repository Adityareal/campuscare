import type { HelpRequestType } from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { encryptOptional } from "@/lib/crypto";
import { db, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { evaluateAfterCommit } from "@/lib/services/access";
import { ensureOpenCase } from "@/lib/services/cases";
import { careTeamIds, notify } from "@/lib/services/notifications";

export const HELP_TYPES: HelpRequestType[] = [
  "GENERAL_SUPPORT",
  "ACADEMIC_STRESS",
  "ANXIETY",
  "COUNSELLING_APPOINTMENT",
  "PSYCHIATRIC_CONSULTATION",
  "URGENT_SUPPORT",
];

export const HELP_TYPE_LABEL: Record<HelpRequestType, string> = {
  GENERAL_SUPPORT: "General emotional support",
  ACADEMIC_STRESS: "Academic stress",
  ANXIETY: "Anxiety-related concerns",
  COUNSELLING_APPOINTMENT: "Counselling appointment",
  PSYCHIATRIC_CONSULTATION: "Psychiatric consultation",
  URGENT_SUPPORT: "Urgent support",
};

/** Creates the request and puts it in a case in the care team's queue (PRD A6). An explicit
 * request is the student's own decision to be contacted, so it does not depend on the
 * care-team review consent that governs pattern monitoring. */
export async function createHelpRequestIn(
  client: DbLike,
  p: { institutionId: string; studentId: string; type: HelpRequestType; details?: string | null; origin: "help_form" | "check_in" | "safety_prompt" },
): Promise<{ helpRequestId: string; caseId: string }> {
  const { caseId } = await ensureOpenCase(client, {
    institutionId: p.institutionId,
    studentId: p.studentId,
    priority: p.type === "URGENT_SUPPORT" ? "URGENT" : "PRIORITY",
    source: "HELP_REQUEST",
    actorId: null,
    summary: `Student asked for: ${HELP_TYPE_LABEL[p.type].toLowerCase()}`,
  });
  const request = await client.helpRequest.create({
    data: {
      institutionId: p.institutionId,
      studentId: p.studentId,
      type: p.type,
      detailsCt: encryptOptional(p.details?.slice(0, 2000)),
      origin: p.origin,
      caseId,
      createdAt: now(),
    },
  });
  if (p.type !== "URGENT_SUPPORT") {
    // Urgent requests notify through the escalation path once the alert exists.
    await notify(client, await careTeamIds(client, p.institutionId), "staff_help_request", { institutionId: p.institutionId, link: `/counsellor/cases/${caseId}` });
  }
  await notify(client, p.studentId, "help_received", { institutionId: p.institutionId, link: "/student/messages" });
  return { helpRequestId: request.id, caseId };
}

export async function requestHelp(
  actor: UserActor,
  input: { type: HelpRequestType; details?: string | null; origin?: "help_form" | "safety_prompt" },
): Promise<{ caseId: string; urgent: boolean }> {
  assertCan(actor, "help.request");
  const institutionId = tenantOf(actor);
  if (!HELP_TYPES.includes(input.type)) fail("VALIDATION", "Choose a type of support.");
  const result = await db.$transaction(async (tx) => {
    const r = await createHelpRequestIn(tx, { institutionId, studentId: actor.userId, type: input.type, details: input.details, origin: input.origin ?? "help_form" });
    await recordAudit(tx, actor, { action: "help.request", entityType: "HelpRequest", entityId: r.helpRequestId, metadata: { type: input.type, caseId: r.caseId } });
    return r;
  });
  await evaluateAfterCommit(actor.userId, institutionId, "help_request");
  return { caseId: result.caseId, urgent: input.type === "URGENT_SUPPORT" };
}
