import type { Metadata } from "next";
import { StaffShell } from "@/components/shell/staff-shell";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ClinicianLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor(["CLINICIAN"]);
  return <StaffShell actor={actor}>{children}</StaffShell>;
}
