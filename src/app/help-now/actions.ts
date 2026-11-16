"use server";

import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n";
import { getInstitutionSettings } from "@/lib/services/config";
import { requestHelp } from "@/lib/services/help";

/** A signed-in student asking the campus team to contact them urgently. It does not depend on
 * privacy consent: asking for help is always the student's own decision. */
export async function requestUrgentContactAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent({ allowConsentReview: true });
    await requestHelp(actor, { type: "URGENT_SUPPORT", origin: "help_form" });
    const settings = await getInstitutionSettings(db, tenantOf(actor));
    revalidatePath("/student");
    return { status: "ok", message: fill(getDictionary(actor.locale).urgent.requested, { hours: settings.careTeamHours }) };
  });
}
