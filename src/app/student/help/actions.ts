"use server";

import { revalidatePath } from "next/cache";
import type { HelpRequestType } from "@prisma/client";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { getInstitutionSettings } from "@/lib/services/config";
import { HELP_TYPES, requestHelp } from "@/lib/services/help";

export async function requestHelpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    const t = getDictionary(actor.locale);
    const chosen = formString(form, "type");
    const type: HelpRequestType | undefined = HELP_TYPES.find((v) => v === chosen);
    if (!type) return { status: "error", code: "VALIDATION", message: getStudentCopy(actor.locale).help.pickOne };
    await requestHelp(actor, { type, details: formOptional(form, "details"), origin: "help_form" });
    const settings = await getInstitutionSettings(db, tenantOf(actor));
    revalidatePath("/student");
    return { status: "ok", message: fill(t.help.sent, { hours: settings.careTeamHours }) };
  });
}
