import type { ConsentScope } from "@/generated/prisma/enums";
import { formBool } from "@/lib/action-state";

/** Reads the three consent checkboxes. The two optional scopes depend on core processing, so
 * they are forced off when core is off. */
export function parseConsentChoices(form: FormData): Record<ConsentScope, boolean> {
  const core = formBool(form, "CORE_PROCESSING");
  return {
    CORE_PROCESSING: core,
    CARE_TEAM_REVIEW: core && formBool(form, "CARE_TEAM_REVIEW"),
    AGGREGATE_ANALYTICS: core && formBool(form, "AGGREGATE_ANALYTICS"),
  };
}
