"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { LinkActionState } from "@/components/admin/state";
import { formString, guarded } from "@/lib/action-state";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { fail } from "@/lib/errors";
import { now } from "@/lib/clock";
import { db, runTx } from "@/lib/db";
import { createInstitution } from "@/lib/services/platform";

const ACCESS_REASONS = ["SUPPORT", "CONFIGURATION", "SECURITY_REVIEW", "OTHER"] as const;
type AccessReason = (typeof ACCESS_REASONS)[number];

function accessReason(value: string): AccessReason {
  if ((ACCESS_REASONS as readonly string[]).includes(value)) return value as AccessReason;
  return fail("VALIDATION", "Choose a reason for opening this institution.");
}

async function currentSessionTokenHash(userId: string): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) fail("UNAUTHENTICATED", "Sign in again before opening an institution.");
  const tokenHash = sha256(token);
  const session = await db.session.findFirst({
    where: { tokenHash, userId, stage: "ACTIVE", expiresAt: { gt: now() } },
    include: { user: { select: { role: true, status: true } } },
  });
  if (!session || session.user.role !== "PLATFORM_ADMIN" || session.user.status !== "ACTIVE") {
    fail("UNAUTHENTICATED", "Your platform administrator session has expired. Sign in again.");
  }
  return tokenHash;
}

export async function enterInstitutionContextAction(form: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const institutionId = formString(form, "institutionId").trim();
  const reason = accessReason(formString(form, "reason"));
  if (!institutionId) fail("VALIDATION", "Choose an institution.");
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!institution) fail("NOT_FOUND", "Institution not found.");
  const tokenHash = await currentSessionTokenHash(actor.userId);

  await runTx(async (tx) => {
    const session = await tx.session.findFirst({
      where: { tokenHash, userId: actor.userId, stage: "ACTIVE", expiresAt: { gt: now() } },
      include: { user: { select: { role: true, status: true } } },
    });
    if (!session || session.user.role !== "PLATFORM_ADMIN" || session.user.status !== "ACTIVE") {
      fail("UNAUTHENTICATED", "Your platform administrator session has expired. Sign in again.");
    }

    const previousId = session.actingInstitutionId;
    if (previousId && previousId !== institutionId) {
      const previousActor = { ...actor, institutionId: previousId, actingInstitutionId: previousId };
      await recordAudit(tx, previousActor, {
        action: "platform.context.exit",
        entityType: "Institution",
        entityId: previousId,
        metadata: { reason: "SWITCH" },
        institutionId: previousId,
      });
      await recordAudit(tx, { ...actor, institutionId: null, actingInstitutionId: null }, {
        action: "platform.context.exit",
        entityType: "Institution",
        entityId: previousId,
        metadata: { reason: "SWITCH" },
        institutionId: "platform",
      });
    }

    await tx.session.update({ where: { id: session.id }, data: { actingInstitutionId: institutionId } });
    await recordAudit(tx, { ...actor, institutionId: null, actingInstitutionId: null }, {
      action: "platform.context.enter",
      entityType: "Institution",
      entityId: institutionId,
      metadata: { reason },
      institutionId: "platform",
    });
    await recordAudit(tx, { ...actor, institutionId, actingInstitutionId: institutionId }, {
      action: "platform.context.enter",
      entityType: "Institution",
      entityId: institutionId,
      metadata: { reason },
      institutionId,
    });
  });

  revalidatePath("/");
  redirect("/admin");
}

export async function exitInstitutionContextAction(): Promise<void> {
  const actor = await requirePlatformAdmin();
  const institutionId = actor.actingInstitutionId;
  if (!institutionId) redirect("/platform");
  const tokenHash = await currentSessionTokenHash(actor.userId);

  await runTx(async (tx) => {
    const session = await tx.session.findFirst({
      where: { tokenHash, userId: actor.userId, stage: "ACTIVE", expiresAt: { gt: now() } },
      include: { user: { select: { role: true, status: true } } },
    });
    if (!session || session.user.role !== "PLATFORM_ADMIN" || session.user.status !== "ACTIVE") {
      fail("UNAUTHENTICATED", "Your platform administrator session has expired. Sign in again.");
    }
    if (session.actingInstitutionId !== institutionId) fail("INVALID_TRANSITION", "The active institution changed. Reload and try again.");

    await tx.session.update({ where: { id: session.id }, data: { actingInstitutionId: null } });
    await recordAudit(tx, actor, {
      action: "platform.context.exit",
      entityType: "Institution",
      entityId: institutionId,
      metadata: { reason: "USER_EXIT" },
      institutionId,
    });
    await recordAudit(tx, { ...actor, institutionId: null, actingInstitutionId: null }, {
      action: "platform.context.exit",
      entityType: "Institution",
      entityId: institutionId,
      metadata: { reason: "USER_EXIT" },
      institutionId: "platform",
    });
  });

  revalidatePath("/");
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
