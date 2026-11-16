"use server";

import { redirect } from "next/navigation";
import { guarded, formString, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { isDomainError } from "@/lib/errors";
import { getStudentCopy } from "@/lib/i18n/student";
import { startSelfAssessment } from "@/lib/services/assessments";

/** Opens (or resumes) a self-started questionnaire and sends the student to it. */
export async function startAssessmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    const chosen = formString(form, "instrument");
    const instrument = chosen === "PHQ9" || chosen === "GAD7" ? chosen : null;
    if (!instrument) return { status: "error", code: "VALIDATION", message: getStudentCopy(actor.locale).home.pickQuestionnaire };
    let id: string;
    try {
      id = await startSelfAssessment(actor, instrument);
    } catch (error) {
      if (isDomainError(error) && error.code === "CONSENT_REQUIRED") redirect("/student/privacy");
      throw error;
    }
    redirect(`/student/assessments/${id}`);
  });
}
