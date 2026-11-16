"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { destroySession, getCurrentActor } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Actions used by the app shells. Private folder (_actions), so it is never a route. */

export async function signOutAction(): Promise<void> {
  const actor = await getCurrentActor();
  if (actor) await recordAudit(db, actor, { action: "auth.sign_out", entityType: "User", entityId: actor.userId });
  await destroySession();
  redirect("/sign-in");
}

export async function setLocaleAction(form: FormData): Promise<void> {
  const actor = await getCurrentActor();
  const locale = form.get("locale");
  if (!actor || (locale !== "en" && locale !== "hi")) return;
  await db.user.update({ where: { id: actor.userId }, data: { locale } });
  revalidatePath("/", "layout");
}
