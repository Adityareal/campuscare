"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { bookAppointment, declineOwnReferral } from "@/lib/services/scheduling";

export async function bookAppointmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    const { appointmentId } = await bookAppointment(actor, {
      slotId: formString(form, "slotId"),
      referralId: formOptional(form, "referralId"),
    });
    revalidatePath("/student/care");
    revalidatePath("/student");
    redirect(`/student/appointments/${appointmentId}?booked=1`);
  });
}

export async function declineReferralAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    await declineOwnReferral(actor, formString(form, "referralId"));
    revalidatePath("/student/care");
    redirect("/student/care?declined=1");
  });
}
