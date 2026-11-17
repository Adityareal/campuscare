"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AlertDecision, ReviewerFeedback, TriageCategory } from "@prisma/client";
import { pickOne } from "@/components/care/form-parse";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireCareTeam } from "@/lib/auth/guards";
import { requestAssessment } from "@/lib/services/assessments";
import {
  acknowledgeAlert,
  assignAlert,
  closeAlert,
  DECISION_LABEL,
  ESCALATION_CHANNELS,
  ESCALATION_OUTCOMES,
  ESCALATION_TARGETS,
  escalateAlert,
  FEEDBACK_LABEL,
  openCaseFromAlert,
  recategorizeAlert,
  recordEscalationAttempt,
  reviewAlert,
} from "@/lib/services/alerts";

function refresh(alertId: string) {
  revalidatePath(`/counsellor/alerts/${alertId}`);
  revalidatePath("/counsellor/alerts");
  revalidatePath("/counsellor");
}

export async function acknowledgeAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    await acknowledgeAlert(actor, alertId);
    refresh(alertId);
    return { status: "ok", message: "Alert acknowledged." };
  });
}

export async function assignAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    await assignAlert(actor, alertId, formString(form, "assigneeId"));
    refresh(alertId);
    return { status: "ok", message: "Alert assigned." };
  });
}

export async function reviewAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    const decision = pickOne(formString(form, "decision"), Object.keys(DECISION_LABEL) as AlertDecision[], "Choose a decision.");
    const feedbackRaw = formString(form, "feedback");
    const feedback = feedbackRaw ? pickOne(feedbackRaw, Object.keys(FEEDBACK_LABEL) as ReviewerFeedback[], "Choose valid feedback.") : null;
    const { caseId } = await reviewAlert(actor, alertId, { decision, feedback, note: formOptional(form, "note") });
    refresh(alertId);
    if (caseId) revalidatePath(`/counsellor/cases/${caseId}`);
    return { status: "ok", message: caseId ? "Review recorded. The alert is on the student's case." : "Review recorded." };
  });
}

export async function escalateAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    await escalateAlert(actor, alertId, formString(form, "reason"));
    refresh(alertId);
    return { status: "ok", message: "Alert escalated to urgent. The on-call responder and care team were notified." };
  });
}

export async function recategorizeAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    const category = pickOne(formString(form, "category"), ["MONITOR", "PRIORITY"] as TriageCategory[], "Choose a category.");
    await recategorizeAlert(actor, alertId, category, formString(form, "reason"));
    refresh(alertId);
    return { status: "ok", message: "Category changed." };
  });
}

export async function recordEscalationAttemptAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    const target = pickOne(formString(form, "target"), ESCALATION_TARGETS, "Choose who you tried to reach.");
    const channel = pickOne(formString(form, "channel"), ESCALATION_CHANNELS, "Choose how you tried to reach them.");
    const outcome = pickOne(formString(form, "outcome"), ESCALATION_OUTCOMES, "Choose what happened.");
    await recordEscalationAttempt(actor, alertId, {
      target,
      channel,
      outcome,
      targetUserId: target === "ON_CALL" ? formOptional(form, "targetUserId") : null,
      targetLabel: target === "EXTERNAL_SERVICE" ? formOptional(form, "targetLabel") : null,
      note: formOptional(form, "note"),
    });
    refresh(alertId);
    return { status: "ok", message: "Attempt recorded." };
  });
}

export async function closeAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    await closeAlert(actor, alertId);
    refresh(alertId);
    return { status: "ok", message: "Alert closed." };
  });
}

export async function requestAssessmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    const instrument = pickOne(formString(form, "instrument"), ["PHQ9", "GAD7"] as const, "Choose a questionnaire.");
    await requestAssessment(actor, formString(form, "studentId"), instrument, alertId);
    refresh(alertId);
    return { status: "ok", message: "Questionnaire sent to the student." };
  });
}

export async function openCaseFromAlertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const alertId = formString(form, "alertId");
    const caseId = await openCaseFromAlert(actor, alertId);
    refresh(alertId);
    redirect(`/counsellor/cases/${caseId}`);
  });
}
