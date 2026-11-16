import type { Metadata } from "next";
import { StudentShell } from "@/components/shell/student-shell";
import { requireActor } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Every /student page requires a signed-in student. Pages call requireStudent() themselves
 * for the consent check, so the onboarding page can render inside the same frame. */
export default async function StudentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor(["STUDENT"]);
  return <StudentShell actor={actor}>{children}</StudentShell>;
}
