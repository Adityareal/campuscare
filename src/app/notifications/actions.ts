"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, guarded, type ActionState } from "@/lib/action-state";
import { requireActor } from "@/lib/auth/session";
import { accessText } from "@/lib/i18n/access";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/services/inbox";

/** Marks the notification read, then follows its in-app link if it has one. */
export async function openNotificationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor();
    const { link } = await markNotificationRead(actor, formString(form, "id"));
    revalidatePath("/notifications");
    if (link) redirect(link);
    return { status: "ok" };
  });
}

export async function markAllReadAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor();
    await markAllNotificationsRead(actor);
    revalidatePath("/notifications");
    return { status: "ok", message: accessText(actor.role === "STUDENT" ? actor.locale : "en").inbox.allMarked };
  });
}
