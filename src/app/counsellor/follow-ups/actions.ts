"use server";

import { revalidatePath } from "next/cache";
import { pickOne } from "@/components/care/form-parse";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireCareTeam } from "@/lib/auth/guards";
import { completeFollowUp, FOLLOW_UP_COMPLETIONS } from "@/lib/services/followups";

export async function completeFollowUpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireCareTeam();
    const status = pickOne(formString(form, "status"), FOLLOW_UP_COMPLETIONS, "Choose how the follow-up ended.");
    await completeFollowUp(actor, formString(form, "followUpId"), { status, outcome: formOptional(form, "outcome") });
    const caseId = formString(form, "caseId");
    if (caseId) revalidatePath(`/counsellor/cases/${caseId}`);
    revalidatePath("/counsellor/follow-ups");
    revalidatePath("/counsellor");
    return { status: "ok", message: "Follow-up updated." };
  });
}
