"use server";

import { revalidatePath } from "next/cache";
import { formString, guarded, type ActionState } from "@/lib/action-state";
import { requireStudent } from "@/lib/auth/guards";
import { messagesCopy } from "@/lib/i18n/messages";
import { sendStudentMessage } from "@/lib/services/messages";

export async function sendStudentMessageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireStudent();
    await sendStudentMessage(actor, formString(form, "caseId"), formString(form, "body"));
    revalidatePath("/student/messages");
    return { status: "ok", message: messagesCopy[actor.locale].sentOk };
  });
}
