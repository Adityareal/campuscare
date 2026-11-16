import type { Metadata } from "next";
import { StaffShell } from "@/components/shell/staff-shell";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The care workspace (alerts, cases, follow-ups) is shared by counsellors and clinicians. */
export default async function CareWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor(["COUNSELLOR", "CLINICIAN"]);
  return <StaffShell actor={actor}>{children}</StaffShell>;
}
