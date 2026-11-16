import type { ActionState } from "@/lib/action-state";

/** Action result that may carry a one-time set-password link. The link exists only in this
 * response; it is never stored in plain text or shown again. */
export type LinkActionState = ActionState & {
  link?: string;
  /** Who the link is for, e.g. "Asha Rao (asha@example.edu)". */
  linkFor?: string;
  /** ISO timestamp of when the link stops working. */
  expiresAt?: string;
};
