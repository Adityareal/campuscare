"use server";

import { revalidatePath } from "next/cache";
import { formString, guarded, type ActionState } from "@/lib/action-state";
import { requireActor } from "@/lib/auth/session";
import { changePassword, confirmMfaEnrollment, startMfaEnrollment } from "@/lib/auth/signin";

export async function startEnrolmentAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor(undefined, { allowMissingMfa: true });
    await startMfaEnrollment(actor);
    revalidatePath("/account/security");
    return { status: "ok", message: "Setup started. Add the key below to your authenticator app." };
  });
}

export async function confirmEnrolmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor(undefined, { allowMissingMfa: true });
    await confirmMfaEnrollment(actor, formString(form, "code"));
    revalidatePath("/account/security");
    revalidatePath("/account");
    return { status: "ok", message: "The second step is now on. You will be asked for a code each time you sign in." };
  });
}

export async function changePasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireActor(undefined, { allowMissingMfa: true });
    const next = formString(form, "next");
    if (next !== formString(form, "confirm")) return { status: "error", message: "The two new passwords do not match." };
    await changePassword(actor, formString(form, "current"), next);
    revalidatePath("/account");
    return { status: "ok", message: "Your password was changed. Other devices have been signed out." };
  });
}
