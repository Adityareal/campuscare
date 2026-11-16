import type { Metadata } from "next";
import { ChangePasswordForm, ConfirmEnrolmentForm, StartEnrolmentForm } from "@/components/auth/account-forms";
import { Notice, PageHeader, Panel, StatusPill, When } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { requireActor } from "@/lib/auth/session";
import { getMfaStatus, getPendingMfaEnrollment } from "@/lib/auth/signin";

export const metadata: Metadata = { title: "Security" };

/** Groups a base32 secret in fours so it is easier to read and type into an authenticator app. */
function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export default async function SecurityPage() {
  const actor = await requireActor(undefined, { allowMissingMfa: true });
  const status = await getMfaStatus(actor);
  const pending = !status.enabledAt && actor.role !== "STUDENT" ? await getPendingMfaEnrollment(actor) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Security"
        description="The second step protects staff accounts with a code from an authenticator app."
        back={{ href: "/account", label: "Account" }}
      />

      {actor.mfa === "missing" ? (
        <Notice tone="warning" title="Set up the second step to continue">
          Other pages stay closed until the second step is on for your account.
        </Notice>
      ) : null}
      {actor.mfa === "demo_exempt" ? (
        <Notice tone="warning" title="Demo account">
          The second step is skipped for demo accounts while demo mode is on. Demo mode must never hold real data.
        </Notice>
      ) : null}

      <Panel
        title="Second step"
        actions={status.enabledAt ? <StatusPill tone="accent">On</StatusPill> : <StatusPill tone="warning">Not set up</StatusPill>}
      >
        {status.enabledAt ? (
          <p className="text-sm text-ink-2">
            Turned on <When date={status.enabledAt} />. You enter a 6-digit code after your password each time you sign in. If you lose access to your
            authenticator app, ask your institution administrator for help.
          </p>
        ) : pending ? (
          <div className="grid gap-6">
            <ol className="grid max-w-prose list-decimal gap-3 pl-5 text-sm text-ink-2">
              <li>Open an authenticator app on your phone and add a new account with a key.</li>
              <li>Enter the key below, or paste the setup link if your app accepts one. Choose time-based codes.</li>
              <li>Type the 6-digit code your app shows, then turn on the second step.</li>
            </ol>
            <div className="grid gap-4 rounded-control bg-surface-2 p-4">
              <div>
                <p className="text-sm text-ink-3">Setup key</p>
                <p className="mt-1 break-all font-mono text-lg font-medium tracking-wider text-ink">{groupSecret(pending.secret)}</p>
              </div>
              <div>
                <p className="text-sm text-ink-3">Setup link</p>
                <p className="mt-1 break-all font-mono text-xs text-ink-2">{pending.uri}</p>
              </div>
            </div>
            <ConfirmEnrolmentForm />
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="max-w-prose text-sm text-ink-2">
              You will get a setup key to add to an authenticator app. Once it is on, signing in needs your password and a 6-digit code.
            </p>
            <StartEnrolmentForm />
          </div>
        )}
      </Panel>

      <Panel title="Change password" description="Other devices are signed out when the password changes.">
        <ChangePasswordForm minLength={PASSWORD_MIN_LENGTH} />
      </Panel>
    </div>
  );
}
