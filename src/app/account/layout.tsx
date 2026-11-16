import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffShell } from "@/components/shell/staff-shell";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Staff account pages. Reachable before a second factor is enrolled, because
 * /account/security is where staff enrol it. Students manage their account under /student. */
export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor(undefined, { allowMissingMfa: true });
  if (actor.role === "STUDENT") redirect("/student/privacy");
  return <StaffShell actor={actor}>{children}</StaffShell>;
}
