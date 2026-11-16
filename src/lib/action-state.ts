import { unstable_rethrow } from "next/navigation";
import { isDomainError, type DomainErrorCode } from "@/lib/errors";

/**
 * Shared shape for Server Action results used with React's useActionState.
 *
 *   "use server";
 *   export async function saveThing(_prev: ActionState, form: FormData): Promise<ActionState> {
 *     return guarded(async () => {
 *       const actor = await requireCareTeam();
 *       await doThing(actor, formString(form, "id"));
 *       revalidatePath("/counsellor/things");
 *       return { status: "ok", message: "Saved." };
 *     });
 *   }
 */
export type ActionState = { status: "idle" | "ok" | "error"; message?: string; code?: DomainErrorCode };

export const IDLE: ActionState = { status: "idle" };

/** Runs an action body. Expected refusals (DomainError) become a message for the form;
 * redirect() and notFound() pass through; anything else is logged and shown generically. */
export async function guarded(run: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await run()) ?? { status: "ok" };
  } catch (error) {
    unstable_rethrow(error);
    if (isDomainError(error)) return { status: "error", message: error.message, code: error.code };
    console.error("[action] unexpected error", error);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}

export function formString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function formOptional(form: FormData, key: string): string | null {
  const v = formString(form, key).trim();
  return v ? v : null;
}

/** Integer field, or null when blank or not a whole number. */
export function formInt(form: FormData, key: string): number | null {
  const v = formString(form, key).trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function formBool(form: FormData, key: string): boolean {
  const v = formString(form, key);
  return v === "on" || v === "true" || v === "1";
}
