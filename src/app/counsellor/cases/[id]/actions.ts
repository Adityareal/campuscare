"use server";

import { revalidatePath } from "next/cache";
import type { ReferralStatus } from "@/generated/prisma/enums";
import { parseIstDateTime, pickOne } from "@/components/care/form-parse";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireCareTeam } from "@/lib/auth/guards";
import {
  addCaseNote,
  assignCase,
  closeCase,
  documentOutcome,
  recordCaseAction,
  reopenCase,
  returnToMonitoring,
  setMissedConcern,
} from "@/lib/services/cases";
import { FOLLOW_UP_KINDS, scheduleFollowUp } from "@/lib/services/followups";
import { sendCaseMessage } from "@/lib/services/messages";
import { createReferral, REFERRAL_SERVICES, updateReferralStatus } from "@/lib/services/referrals";

const REFERRAL_STATUSES: readonly ReferralStatus[] = ["CREATED", "BOOKED", "ATTENDED", "NOT_ATTENDED", "DECLINED", "CLOSED"];

function refresh(caseId: string) {
  revalidatePath(`/counsellor/cases/${caseId}`);
  revalidatePath("/counsellor/cases");
  revalidatePath("/counsellor");
}

export async function assignCaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await assignCase(actor, caseId, formString(form, "assigneeId"));
    refresh(caseId);
    return { status: "ok", message: "Case assigned." };
  });
}

export async function recordContactedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await recordCaseAction(actor, caseId, "CONTACTED", formOptional(form, "note"));
    refresh(caseId);
    return { status: "ok", message: "Contact recorded." };
  });
}

export async function recordArrangedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await recordCaseAction(actor, caseId, "ARRANGED", formOptional(form, "note"));
    refresh(caseId);
    return { status: "ok", message: "Recorded as arranged." };
  });
}

export async function addCaseNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await addCaseNote(actor, caseId, formString(form, "note"));
    refresh(caseId);
    return { status: "ok", message: "Note added." };
  });
}

export async function documentOutcomeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await documentOutcome(actor, caseId, formString(form, "outcome"));
    refresh(caseId);
    return { status: "ok", message: "Outcome documented." };
  });
}

export async function returnToMonitoringAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    const at = parseIstDateTime(formString(form, "reviewDate"), "09:00");
    await returnToMonitoring(actor, caseId, at);
    refresh(caseId);
    return { status: "ok", message: "Case returned to monitoring. A review follow-up was scheduled." };
  });
}

export async function closeCaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await closeCase(actor, caseId);
    refresh(caseId);
    return { status: "ok", message: "Case closed." };
  });
}

export async function reopenCaseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await reopenCase(actor, caseId);
    refresh(caseId);
    return { status: "ok", message: "Case reopened." };
  });
}

export async function setMissedConcernAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    const missed = formString(form, "missed") === "true";
    await setMissedConcern(actor, caseId, missed);
    refresh(caseId);
    return { status: "ok", message: missed ? "Flagged for missed-concern review." : "Missed-concern flag removed." };
  });
}

export async function createReferralAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    const service = pickOne(formString(form, "service"), REFERRAL_SERVICES, "Choose a service for the referral.");
    await createReferral(actor, { caseId, service, professionalId: formOptional(form, "professionalId"), reason: formString(form, "reason") });
    refresh(caseId);
    return { status: "ok", message: "Referral created. The student was notified." };
  });
}

export async function updateReferralStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    const status = pickOne(formString(form, "status"), REFERRAL_STATUSES, "Choose a new status.");
    await updateReferralStatus(actor, formString(form, "referralId"), status, formOptional(form, "note"));
    refresh(caseId);
    return { status: "ok", message: "Referral updated." };
  });
}

export async function scheduleFollowUpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    const kind = pickOne(formString(form, "kind"), FOLLOW_UP_KINDS, "Choose the kind of follow-up.");
    const dueAt = parseIstDateTime(formString(form, "dueDate"), formString(form, "dueTime") || "10:00");
    await scheduleFollowUp(actor, { caseId, kind, dueAt, assignedToId: formOptional(form, "assignedToId") });
    refresh(caseId);
    revalidatePath("/counsellor/follow-ups");
    return { status: "ok", message: "Follow-up scheduled." };
  });
}

export async function sendCaseMessageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const caseId = formString(form, "caseId");
    await sendCaseMessage(actor, caseId, formString(form, "body"));
    refresh(caseId);
    return { status: "ok", message: "Message sent. The student was notified." };
  });
}
