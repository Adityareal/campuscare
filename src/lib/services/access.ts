import type { UserActor } from "@/lib/actor";
import { systemActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { tenantOf } from "@/lib/auth/permissions";
import { db, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { hasConsent } from "@/lib/services/consent";
import { evaluateStudentRisk, type RiskOutcome } from "@/lib/services/risk";

/** Loads a student of the actor's institution. Students of other institutions are reported as
 * not found, so tenant boundaries do not leak whether a record exists. */
export async function studentInTenant(client: DbLike, actor: UserActor, studentId: string) {
  const institutionId = tenantOf(actor);
  const student = await client.user.findFirst({
    where: { id: studentId, institutionId, role: "STUDENT" },
    include: { student: { include: { department: true } } },
  });
  if (!student) fail("NOT_FOUND", "Student not found.");
  return student;
}

/** Check-in and screening trends are visible to the care team only with the student's consent. */
export async function careTeamMaySeeTrends(client: DbLike, studentId: string): Promise<boolean> {
  return hasConsent(client, studentId, "CARE_TEAM_REVIEW");
}

/** Runs the risk rules after the triggering write has committed. A failure must never lose
 * the student's submission, but it must be visible: it is logged and written to the audit log. */
export async function evaluateAfterCommit(studentId: string, institutionId: string, trigger: string): Promise<RiskOutcome | null> {
  try {
    return await evaluateStudentRisk(studentId, institutionId);
  } catch (error) {
    console.error("[risk-engine] evaluation failed", { studentId, trigger, error });
    await recordAudit(db, systemActor("risk-engine", institutionId), {
      action: "risk.evaluation_failed",
      entityType: "User",
      entityId: studentId,
      metadata: { trigger },
    }).catch(() => undefined);
    return null;
  }
}
