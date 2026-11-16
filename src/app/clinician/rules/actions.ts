"use server";

import { revalidatePath } from "next/cache";
import { formBool, formInt, formString, guarded, type ActionState } from "@/lib/action-state";
import { requireClinician } from "@/lib/auth/guards";
import { RULE_GROUPS, setAt } from "@/components/telehealth/rules-fields";
import { getRules, updateRules } from "@/lib/services/rules-admin";

/** Starts from the stored rules and overwrites only the fields the form exposes. */
function rulesFromForm(current: unknown, form: FormData): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
  for (const group of RULE_GROUPS) {
    for (const field of group.fields) {
      if (field.kind === "boolean") setAt(next, field.path, formBool(form, field.path));
      else if (field.kind === "select") setAt(next, field.path, formString(form, field.path));
      else {
        const raw = formString(form, field.path).trim();
        setAt(next, field.path, raw === "" ? Number.NaN : Number(raw));
      }
    }
  }
  // The safety rule has no switch on the form and stays on whatever the request contains.
  setAt(next, "phq9SafetyItem.enabled", true);
  return next;
}

export async function updateRulesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const actor = await requireClinician();
    const { rules } = await getRules(actor);
    const expectedVersion = formInt(form, "expectedVersion");
    const result = await updateRules(actor, rulesFromForm(rules, form), expectedVersion ?? undefined);
    revalidatePath("/clinician/rules");
    return { status: "ok", message: `Rules saved as version ${result.version}. They apply to new evaluations only.` };
  });
}
