"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formInt, formOptional, formString, guarded, type ActionState } from "@/lib/action-state";
import { registerStudent } from "@/lib/auth/signin";
import { accessText, localeFromParam } from "@/lib/i18n/access";

export async function registerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const lang = localeFromParam(formString(form, "lang"));
    const password = formString(form, "password");
    if (password !== formString(form, "confirm")) return { status: "error", message: accessText(lang).register.mismatch };

    await registerStudent({
      inviteCode: formString(form, "inviteCode"),
      name: formString(form, "name"),
      email: formString(form, "email"),
      studentNumber: formString(form, "studentNumber"),
      departmentId: formString(form, "departmentId"),
      academicYear: formInt(form, "academicYear") ?? 0,
      locale: formString(form, "locale"),
      phone: formOptional(form, "phone"),
      password,
      userAgent: (await headers()).get("user-agent"),
    });
    redirect("/student/onboarding");
  });
}
