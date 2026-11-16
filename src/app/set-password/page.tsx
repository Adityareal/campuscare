import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Notice, linkClass } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { getCurrentActor, homeFor } from "@/lib/auth/session";
import { setPasswordTokenIsUsable } from "@/lib/auth/signin";

export const metadata: Metadata = {
  title: "Set your password",
  // The link carries a one-time token, so it must not be indexed or leak through the referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const actor = await getCurrentActor();
  if (actor) redirect(homeFor(actor.role));

  const token = ((await searchParams).token ?? "").trim();
  const usable = token ? await setPasswordTokenIsUsable(token) : false;

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Set your password</h1>
      {usable ? (
        <>
          <p className="mt-1.5 text-ink-2">Choose a password for your CampusCare account. After this you can sign in.</p>
          <div className="mt-6">
            <SetPasswordForm token={token} minLength={PASSWORD_MIN_LENGTH} />
          </div>
        </>
      ) : (
        <>
          <Notice tone="info" className="mt-5" title="This link cannot be used">
            The link is missing, has expired or was already used. Ask your administrator to send a new one.
          </Notice>
          <p className="mt-6 text-sm">
            <Link href="/sign-in" className={linkClass}>
              Go to sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
