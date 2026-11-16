"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { cancelAppointment, rescheduleAppointment } from "@/lib/services/scheduling";

export async function cancelAppointmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    await cancelAppointment(actor, formString(form, "appointmentId"), formOptional(form, "reason"));
    revalidatePath("/student/care");
    revalidatePath("/student");
    redirect("/student/care?cancelled=1");
  });
}

export async function rescheduleAppointmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    const slotId = formString(form, "slotId");
    if (!slotId) return { status: "error", message: "Choose a new time first." };
    const { appointmentId } = await rescheduleAppointment(actor, formString(form, "appointmentId"), slotId);
    revalidatePath("/student/care");
    revalidatePath("/student");
    redirect(`/student/appointments/${appointmentId}?moved=1`);
  });
}
