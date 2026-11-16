import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/app/_actions/shell";
import { RevokeSessionForm } from "@/components/auth/account-forms";
import { Button, KeyValueList, Notice, PageHeader, Panel, StatusPill, Table, Td, Th, When, linkClass } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { getOwnProfile, listOwnSessions } from "@/lib/auth/signin";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Account" };

const ROLE_LABEL = {
  STUDENT: "Student",
  COUNSELLOR: "Counsellor",
  CLINICIAN: "Clinician",
  INSTITUTION_ADMIN: "Institution administrator",
  SUPPORT_STAFF: "Support staff",
  PLATFORM_ADMIN: "Platform administrator",
} as const;

/** A short, human label for a user-agent string. It is only a hint to help recognise a device. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unknown system";
  return `${browser} on ${system}`;
}

export default async function AccountPage() {
  const actor = await requireActor(undefined, { allowMissingMfa: true });
  const [profile, sessions] = await Promise.all([getOwnProfile(actor), listOwnSessions(actor)]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Account"
        description="Your profile, the devices signed in to your account, and a way to sign out."
        actions={
          <form action={signOutAction}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        }
      />

      {actor.mfa === "missing" ? (
        <Notice
          tone="warning"
          title="Set up the second step"
          action={
            <Link href="/account/security" className={linkClass}>
              Go to security settings
            </Link>
          }
        >
          Staff accounts need a second step before other pages open.
        </Notice>
      ) : null}

      <Panel title="Profile">
        <KeyValueList
          items={[
            { label: "Name", value: profile.name },
            { label: "Email", value: profile.email },
            { label: "Role", value: ROLE_LABEL[profile.role] },
            { label: "Institution", value: profile.institutionName ?? "Platform" },
            { label: "Last sign-in", value: profile.lastLoginAt ? <When date={profile.lastLoginAt} /> : "Not recorded" },
            {
              label: "Second step",
              value: profile.mfaEnabledAt ? <StatusPill tone="accent">On</StatusPill> : <StatusPill tone="warning">Not set up</StatusPill>,
            },
          ]}
        />
        <p className="mt-4 text-sm">
          <Link href="/account/security" className={linkClass}>
            Security settings
          </Link>
          <span className="mx-2 text-ink-3" aria-hidden>
            |
          </span>
          <Link href="/notifications" className={linkClass}>
            Notifications
          </Link>
        </p>
      </Panel>

      <Panel title="Signed-in devices" description="End any session you do not recognise.">
        <Table caption="Sessions signed in to your account">
          <thead>
            <tr>
              <Th>Device</Th>
              <Th>Signed in</Th>
              <Th>Last active</Th>
              <Th>
                <span className="sr-only">Action</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <Td>
                  {describeDevice(s.userAgent)}
                  {s.current ? (
                    <span className="ml-2">
                      <StatusPill tone="accent">This device</StatusPill>
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <When date={s.createdAt}>{fmtDateTime(s.createdAt)}</When>
                </Td>
                <Td>
                  <When date={s.lastSeenAt}>{fmtDateTime(s.lastSeenAt)}</When>
                </Td>
                <Td>
                  <RevokeSessionForm sessionId={s.id} current={s.current} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
