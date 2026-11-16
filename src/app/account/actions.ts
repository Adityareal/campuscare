"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, guarded, type ActionState } from "@/lib/action-state";
import { destroySession, requireActor } from "@/lib/auth/session";
import { revokeSession } from "@/lib/auth/signin";

export async function revokeSessionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor(undefined, { allowMissingMfa: true });
    const { wasCurrent } = await revokeSession(actor, formString(form, "sessionId"));
    if (wasCurrent) {
      await destroySession();
      redirect("/sign-in");
    }
    revalidatePath("/account");
    return { status: "ok", message: "Session ended." };
  });
}
