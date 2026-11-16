"use server";

import { revalidatePath } from "next/cache";
import { formInt, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireClinician } from "@/lib/auth/guards";
import { istToUtc } from "@/lib/format";
import { createSlots, removeSlot } from "@/lib/services/scheduling";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function createSlotsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireClinician();
    const day = formString(form, "date").trim();
    if (!DAY_PATTERN.test(day)) return { status: "error", message: "Choose a date." };
    const times = formString(form, "times")
      .split(/[\s,;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (times.length === 0) return { status: "error", message: "Enter at least one start time, for example 09:00." };
    const bad = times.find((v) => !TIME_PATTERN.test(v));
    if (bad) return { status: "error", message: `"${bad}" is not a 24-hour time such as 09:30.` };
    const durationMinutes = formInt(form, "durationMinutes");
    if (durationMinutes === null) return { status: "error", message: "Choose a session length." };
    const mode = formString(form, "mode") === "IN_PERSON" ? "IN_PERSON" : "VIDEO";

    const count = await createSlots(actor, { startsAt: times.map((v) => istToUtc(day, v)), durationMinutes, mode });
    revalidatePath("/clinician/availability");
    return { status: "ok", message: count === 1 ? "1 time added." : `${count} times added.` };
  });
}

export async function removeSlotAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireClinician();
    await removeSlot(actor, formString(form, "slotId"));
    revalidatePath("/clinician/availability");
    return { status: "ok", message: "Time removed." };
  });
}
