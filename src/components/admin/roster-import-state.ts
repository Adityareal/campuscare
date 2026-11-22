import type { ActionState } from "@/lib/action-state";
import type { RosterImportFailure, RosterImportSuccess } from "@/lib/services/roster-import";

export type RosterImportActionState = ActionState & {
  batch?: string;
  created?: RosterImportSuccess[];
  skipped?: RosterImportFailure[];
  auditSummaryRecorded?: boolean;
};

export type RosterImportAction = (prev: RosterImportActionState, form: FormData) => Promise<RosterImportActionState>;
