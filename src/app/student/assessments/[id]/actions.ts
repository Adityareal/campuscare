"use server";

import { revalidatePath } from "next/cache";
import { formInt, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { instrumentFor } from "@/lib/instruments";
import { getOwnAssessment, submitAssessment } from "@/lib/services/assessments";
import { getInstitutionSettings } from "@/lib/services/config";
import { requestHelp } from "@/lib/services/help";

/** Saves a completed questionnaire. The stored result is then rendered by the page itself,
 * so this only reports a refusal or a plain confirmation. */
export async function submitAssessmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    const t = getDictionary(actor.locale);
    const id = formString(form, "assessmentId");
    const assessment = await getOwnAssessment(actor, id);
    const def = instrumentFor(assessment.instrument);

    const responses: number[] = [];
    for (let i = 0; i < def.items.length; i++) {
      const value = formInt(form, `item-${i}`);
      if (value === null) return { status: "error", code: "VALIDATION", message: t.assessment.incomplete };
      responses.push(value);
    }
    await submitAssessment(actor, id, responses, formInt(form, "difficulty"));
    revalidatePath(`/student/assessments/${id}`);
    revalidatePath("/student");
    revalidatePath("/student/history");
    return { status: "ok" };
  });
}

/** The student's own request, from the safety panel, that the campus team contacts them. */
export async function requestSafetyContactAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    await requestHelp(actor, { type: "URGENT_SUPPORT", origin: "safety_prompt" });
    const settings = await getInstitutionSettings(db, tenantOf(actor));
    revalidatePath("/student");
    return { status: "ok", message: fill(getStudentCopy(actor.locale).assessment.safetyRequested, { hours: settings.careTeamHours }) };
  });
}
