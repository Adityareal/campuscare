"use server";

import { guarded, type ActionState } from "@/lib/action-state";
import { requireActor } from "@/lib/auth/session";
import { markJoined } from "@/lib/services/consultations";

/** Records that the signed-in student or clinician entered the room. */
export async function joinConsultationAction(appointmentId: string): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor(["STUDENT", "CLINICIAN"]);
    await markJoined(actor, appointmentId);
    return { status: "ok" };
  });
}
