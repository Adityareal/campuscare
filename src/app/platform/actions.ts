"use server";

import { revalidatePath } from "next/cache";
import type { LinkActionState } from "@/components/admin/state";
import { formString, guarded } from "@/lib/action-state";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createInstitution } from "@/lib/services/platform";

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
