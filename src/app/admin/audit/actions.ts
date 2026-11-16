"use server";

import type { LinkActionState } from "@/components/admin/state";
import { guarded } from "@/lib/action-state";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { verifyInstitutionAuditChain } from "@/lib/services/admin";

export async function verifyChainAction(_prev: LinkActionState, _form: FormData): Promise<LinkActionState> {
  return guarded(async () => {
    const actor = await requireInstitutionAdmin();
    const result = await verifyInstitutionAuditChain(actor);
    if (result.ok) {
      return { status: "ok", message: `The audit log is intact. ${result.checked} entries were checked and every link in the chain matches.` };
    }
    return {
      status: "error",
      message: `The audit log failed verification at entry ${result.brokenAtSeq ?? "unknown"} of ${result.checked}. Entries may have been changed outside CampusCare. Contact the platform team and keep a copy of this page.`,
    };
  });
}
