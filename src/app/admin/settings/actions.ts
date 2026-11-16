"use server";

import { revalidatePath } from "next/cache";
import type { LinkActionState } from "@/components/admin/state";
import { formInt, formOptional, formString, guarded } from "@/lib/action-state";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { fail } from "@/lib/errors";
import { createDepartment, renameDepartment, updateInstitutionSettings } from "@/lib/services/admin";

function strings(form: FormData, key: string): string[] {
  return form.getAll(key).map((v) => (typeof v === "string" ? v : ""));
}

function wholeNumber(form: FormData, key: string, label: string): number {
  const v = formInt(form, key);
  if (v === null) fail("VALIDATION", `Enter a whole number for ${label}.`);
  return v;
}

export async function updateSettingsAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const labels = strings(form, "contactLabel");
    const phones = strings(form, "contactPhone");
    const hours = strings(form, "contactHours");
    if (labels.length !== phones.length || labels.length !== hours.length) {
      fail("VALIDATION", "The campus contacts were incomplete. Reload the page and try again.");
    }
    await updateInstitutionSettings(actor, {
      checkInCadence: formString(form, "checkInCadence") === "DAILY" ? "DAILY" : "WEEKLY",
      careTeamHours: formString(form, "careTeamHours"),
      campusContacts: labels.map((label, i) => ({ label, phone: phones[i] ?? "", hours: hours[i] ?? "" })),
      onCallResponderId: formOptional(form, "onCallResponderId"),
      urgentAckMinutes: wholeNumber(form, "urgentAckMinutes", "the urgent window"),
      priorityAckHours: wholeNumber(form, "priorityAckHours", "the priority window"),
      monitorAckHours: wholeNumber(form, "monitorAckHours", "the monitor window"),
      minCohortSize: wholeNumber(form, "minCohortSize", "the minimum group size"),
      retentionMonths: wholeNumber(form, "retentionMonths", "record retention"),
    });
    revalidatePath("/admin", "layout");
    return { status: "ok", message: "Settings saved." };
  });
}

export async function createDepartmentAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    await createDepartment(actor, { code: formString(form, "code"), name: formString(form, "name") });
    revalidatePath("/admin/settings");
    return { status: "ok", message: "Department added." };
  });
}

export async function renameDepartmentAction(_prev: LinkActionState, form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const departmentId = formString(form, "departmentId");
    if (!departmentId) fail("VALIDATION", "Something was missing from the form. Reload the page and try again.");
    await renameDepartment(actor, departmentId, { name: formString(form, "name") });
    revalidatePath("/admin/settings");
    return { status: "ok", message: "Department renamed." };
  });
}
