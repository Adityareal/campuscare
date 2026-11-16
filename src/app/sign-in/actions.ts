"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { guarded, formString, type ActionState } from "@/lib/action-state";
import { homeFor } from "@/lib/auth/session";
import { signInAsDemoPersona, signInWithPassword, verifySecondFactor } from "@/lib/auth/signin";
import { accessText, localeFromParam } from "@/lib/i18n/access";

async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

function langQuery(lang: "en" | "hi"): string {
  return lang === "hi" ? "?lang=hi" : "";
}

export async function signInAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const lang = localeFromParam(formString(form, "lang"));
    const email = formString(form, "email");
    const password = formString(form, "password");
    if (!email.trim() || !password) return { status: "error", message: accessText(lang).signIn.emptyFields };
    const result = await signInWithPassword(email, password, await userAgent());
    redirect(result.next === "verify" ? `/sign-in/verify${langQuery(lang)}` : homeFor(result.role));
  });
}

export async function demoSignInAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const { role } = await signInAsDemoPersona(formString(form, "persona"), await userAgent());
    redirect(homeFor(role));
  });
}

export async function verifyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const lang = localeFromParam(formString(form, "lang"));
    const code = formString(form, "code");
    if (!code.trim()) return { status: "error", message: accessText(lang).verify.emptyCode };
    const { role } = await verifySecondFactor(code, await userAgent());
    redirect(homeFor(role));
  });
}
