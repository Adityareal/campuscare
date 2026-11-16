"use server";

import { revalidatePath } from "next/cache";
import { formInt, formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { isDomainError } from "@/lib/errors";
import { fill, getDictionary } from "@/lib/i18n";
import { getInstitutionSettings } from "@/lib/services/config";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { submitCheckIn } from "@/lib/services/checkins";

const TALK_VALUES = ["NO", "NOT_NOW", "YES"] as const;

export async function submitCheckInAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    const t = getDictionary(actor.locale);
    const talk = formString(form, "wantsToTalk");
    try {
      const result = await submitCheckIn(actor, {
        mood: formInt(form, "mood"),
        stress: formInt(form, "stress"),
        sleep: formInt(form, "sleep"),
        energy: formInt(form, "energy"),
        social: formInt(form, "social"),
        academicPressure: formInt(form, "academicPressure"),
        wantsToTalk: TALK_VALUES.find((v) => v === talk) ?? null,
        note: formOptional(form, "note"),
      });
      revalidatePath("/student");
      revalidatePath("/student/history");
      let message = t.checkIn.saved;
      if (result.requestedContact) {
        const settings = await getInstitutionSettings(db, tenantOf(actor));
        message = `${message} ${fill(t.checkIn.talkConfirm, { hours: settings.careTeamHours })}`;
      }
      return { status: "ok", message };
    } catch (error) {
      if (isDomainError(error) && error.code === "CONSENT_REQUIRED") {
        return { status: "error", code: error.code, message: t.checkIn.consentNeeded };
      }
      throw error;
    }
  });
}
