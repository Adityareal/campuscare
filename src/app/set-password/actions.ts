"use server";

import { redirect } from "next/navigation";
import { formString, guarded, type ActionState } from "@/lib/action-state";
import { consumeSetPasswordToken } from "@/lib/auth/signin";

export async function setPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const password = formString(form, "password");
    if (password !== formString(form, "confirm")) return { status: "error", message: "The two passwords do not match." };
    await consumeSetPasswordToken(formString(form, "token"), password);
    redirect("/sign-in?notice=password-set");
  });
}
