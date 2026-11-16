"use server";

import { revalidatePath } from "next/cache";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireClinician } from "@/lib/auth/guards";
import { istToUtc } from "@/lib/format";
import { addClinicalNote, NOTE_KINDS, type NoteKind } from "@/lib/services/clinical-notes";
import { completeConsultation } from "@/lib/services/consultations";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function completeConsultationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireClinician();
    const appointmentId = formString(form, "appointmentId");
    const outcome = formString(form, "outcome");
    if (outcome !== "attended" && outcome !== "no_show") return { status: "error", message: "Choose whether the student attended." };

    const dueDay = formOptional(form, "followUpDate");
    let followUp: { dueAt: Date; kind: string } | null = null;
    if (dueDay) {
      if (!DAY_PATTERN.test(dueDay)) return { status: "error", message: "Choose a valid follow-up date." };
      followUp = { dueAt: istToUtc(dueDay, "09:00"), kind: formString(form, "followUpKind") };
    }

    await completeConsultation(actor, appointmentId, { attended: outcome === "attended", followUp });
    revalidatePath(`/clinician/appointments/${appointmentId}`);
    revalidatePath("/clinician");
    return { status: "ok", message: "Outcome recorded." };
  });
}

export async function addClinicalNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireClinician();
    const appointmentId = formString(form, "appointmentId");
    const kind = formString(form, "kind");
    if (!(NOTE_KINDS as readonly string[]).includes(kind)) return { status: "error", message: "Choose a note type." };
    await addClinicalNote(actor, { appointmentId, kind: kind as NoteKind, body: formString(form, "body") });
    revalidatePath(`/clinician/appointments/${appointmentId}`);
    return { status: "ok", message: "Note saved." };
  });
}
