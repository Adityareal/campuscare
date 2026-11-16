import type { Metadata } from "next";
import { StaffShell } from "@/components/shell/staff-shell";
import { StudentShell } from "@/components/shell/student-shell";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NotificationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor();
  return actor.role === "STUDENT" ? <StudentShell actor={actor}>{children}</StudentShell> : <StaffShell actor={actor}>{children}</StaffShell>;
}
