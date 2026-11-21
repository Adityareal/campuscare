import type { Metadata } from "next";
import { StaffShell } from "@/components/shell/staff-shell";
import { requireInstitutionAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InstitutionAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireInstitutionAdmin();
  return <StaffShell actor={actor}>{children}</StaffShell>;
}
