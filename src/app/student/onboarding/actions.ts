"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseConsentChoices } from "@/components/student/consent-choices";
import { guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { recordConsentChoices } from "@/lib/services/consent";

export async function saveOnboardingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent({ allowConsentReview: true });
    await recordConsentChoices(actor, parseConsentChoices(form), "onboarding", actor.locale);
    revalidatePath("/student", "layout");
    redirect("/student");
  });
}
