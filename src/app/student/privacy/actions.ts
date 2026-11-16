"use server";

import { revalidatePath } from "next/cache";
import { parseConsentChoices } from "@/components/student/consent-choices";
import { guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { getDictionary } from "@/lib/i18n";
import { recordConsentChoices } from "@/lib/services/consent";

export async function savePrivacyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    await recordConsentChoices(actor, parseConsentChoices(form), "privacy_settings", actor.locale);
    revalidatePath("/student", "layout");
    return { status: "ok", message: getDictionary(actor.locale).privacy.saved };
  });
}
