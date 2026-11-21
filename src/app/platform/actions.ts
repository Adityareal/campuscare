"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LinkActionState } from "@/components/admin/state";
import { formString, guarded } from "@/lib/action-state";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { currentSessionTokenHash } from "@/lib/auth/session";
import { closeInstitution, createInstitution, openInstitution } from "@/lib/services/platform";

/** Opens an institution (or switches to another) and goes to its administration pages. */
export async function openInstitutionAction(form: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const state = await guarded(async () => {
    await openInstitution(actor, await currentSessionTokenHash(), formString(form, "institutionId"));
    return { status: "ok" as const };
  });
  revalidatePath("/", "layout");
  redirect(state.status === "ok" ? "/admin" : "/platform");
}

/** Leaves the institution and returns to the platform page. */
export async function closeInstitutionAction(): Promise<void> {
  const actor = await requirePlatformAdmin();
  await guarded(async () => {
    await closeInstitution(actor, await currentSessionTokenHash());
    return { status: "ok" as const };
  });
  revalidatePath("/", "layout");
  redirect("/platform");
}

export async function createInstitutionAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  let result: LinkActionState = { status: "idle" };
  const state = await guarded(async () => {
    const actor = await requirePlatformAdmin();
    const adminName = formString(form, "adminName");
    const adminEmail = formString(form, "adminEmail");
    const created = await createInstitution(actor, {
      name: formString(form, "name"),
      slug: formString(form, "slug"),
      city: formString(form, "city"),
      emailDomain: formString(form, "emailDomain"),
      adminName,
      adminEmail,
    });
    revalidatePath("/platform");
    result = {
      status: "ok",
      message: "Institution created. Give the link below to its first administrator.",
      link: created.link,
      linkFor: `${adminName.trim()} (${adminEmail.trim().toLowerCase()})`,
      expiresAt: created.expiresAt.toISOString(),
    };
    return result;
  });
  return state.status === "ok" ? result : state;
}
