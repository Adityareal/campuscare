"use server";

import { revalidatePath } from "next/cache";
import type { LinkActionState } from "@/components/admin/state";
import type { RosterImportActionState } from "@/components/admin/roster-import-state";
import { formInt, formOptional, formString, guarded } from "@/lib/action-state";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { fail } from "@/lib/errors";
import {
  createStudentInvite,
  inviteStaff,
  reactivateUser,
  resetAccess,
  revokeInvite,
  suspendUser,
  verifyProfessional,
  type InviteStaffInput,
} from "@/lib/services/admin";
import { importInstitutionRoster } from "@/lib/services/roster-import";

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireId(form: FormData, key: string): string {
  const v = formString(form, key).trim();
  if (!v) fail("VALIDATION", "Something was missing from the form. Reload the page and try again.");
  return v;
}

export async function inviteStaffAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  let result: LinkActionState = { status: "idle" };
  const state = await guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const role = formString(form, "role") as InviteStaffInput["role"];
    const withProfile = (role === "COUNSELLOR" || role === "CLINICIAN") && formString(form, "withProfile") === "on";
    const fee = formInt(form, "feeInr");
    const name = formString(form, "name");
    const email = formString(form, "email");
    const invited = await inviteStaff(actor, {
      name,
      email,
      role,
      professional: withProfile
        ? {
            profession: formString(form, "profession") as NonNullable<InviteStaffInput["professional"]>["profession"],
            qualifications: formString(form, "qualifications"),
            registrationBody: formOptional(form, "registrationBody"),
            registrationNumber: formOptional(form, "registrationNumber"),
            languages: list(formOptional(form, "languages")),
            specialisations: list(formOptional(form, "specialisations")),
            feeInr: fee ?? 0,
            bio: formString(form, "bio"),
          }
        : null,
    });
    revalidatePath("/admin/users");
    result = {
      status: "ok",
      message: "Account created. Share the link below with the new staff member.",
      link: invited.link,
      linkFor: `${name.trim()} (${email.trim().toLowerCase()})`,
      expiresAt: invited.expiresAt.toISOString(),
    };
    return result;
  });
  return state.status === "ok" ? result : state;
}

export async function createStudentInviteAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const maxUses = formInt(form, "maxUses");
    const expiresInDays = formInt(form, "expiresInDays");
    if (maxUses === null || expiresInDays === null) fail("VALIDATION", "Enter whole numbers for uses and days.");
    const invite = await createStudentInvite(actor, { maxUses, expiresInDays });
    revalidatePath("/admin/users");
    return { status: "ok", message: `Invite code ${invite.code} created. Share it with students so they can register.` };
  });
}

export async function importRosterAction(_prev: RosterImportActionState, form: FormData): Promise<RosterImportActionState> {
  const batch = formString(form, "batch").slice(0, 80);
  let result: RosterImportActionState = { status: "idle", batch };
  const state = await guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const serialized = formString(form, "rows");
    if (!serialized || new TextEncoder().encode(serialized).length > 400_000) {
      fail("VALIDATION", "This roster is too large to submit. Split it into smaller files and try again.");
    }
    let rows: unknown;
    try {
      rows = JSON.parse(serialized) as unknown;
    } catch {
      fail("VALIDATION", "The roster data could not be read. Choose the file and try again.");
    }
    const imported = await importInstitutionRoster(actor, rows);
    revalidatePath("/admin/users");
    const createdCount = imported.created.length;
    const skippedCount = imported.skipped.length;
    result = {
      status: "ok",
      batch,
      message: `${createdCount} account${createdCount === 1 ? "" : "s"} created; ${skippedCount} row${skippedCount === 1 ? "" : "s"} skipped.`,
      created: imported.created,
      skipped: imported.skipped,
      auditSummaryRecorded: imported.auditSummaryRecorded,
    };
    return result;
  });
  return state.status === "ok" ? result : { ...state, batch };
}

export async function revokeInviteAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    await revokeInvite(actor, requireId(form, "inviteId"));
    revalidatePath("/admin/users");
    return { status: "ok", message: "Invite code revoked." };
  });
}

export async function suspendUserAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const userId = requireId(form, "userId");
    await suspendUser(actor, userId);
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return { status: "ok", message: "Account suspended and signed out everywhere." };
  });
}

export async function reactivateUserAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const userId = requireId(form, "userId");
    await reactivateUser(actor, userId);
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return { status: "ok", message: "Account reactivated." };
  });
}

export async function resetAccessAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  let result: LinkActionState = { status: "idle" };
  const state = await guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const userId = requireId(form, "userId");
    const reset = await resetAccess(actor, userId);
    revalidatePath(`/admin/users/${userId}`);
    result = {
      status: "ok",
      message: "Access reset. The person was signed out and must set a new password and second factor.",
      link: reset.link,
      expiresAt: reset.expiresAt.toISOString(),
    };
    return result;
  });
  return state.status === "ok" ? result : state;
}

export async function verifyProfessionalAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const userId = requireId(form, "userId");
    await verifyProfessional(actor, userId, {
      registrationBody: formString(form, "registrationBody"),
      registrationNumber: formString(form, "registrationNumber"),
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return { status: "ok", message: "Professional registration marked as verified." };
  });
}
