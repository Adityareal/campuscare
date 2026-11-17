import type { Metadata } from "next";
import type { Role } from "@prisma/client";
import { RowActionForm, VerifyProfessionalForm } from "@/components/admin/forms";
import { orNotFound } from "@/components/admin/not-found";
import { EmptyState, KeyValueList, PageHeader, Panel, StatusPill, Table, Td, Th, When } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { getAccessHistory, getProfessionalProfile } from "@/lib/services/admin";
import { reactivateUserAction, resetAccessAction, suspendUserAction, verifyProfessionalAction } from "@/app/admin/users/actions";

export const metadata: Metadata = { title: "Person" };

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  COUNSELLOR: "Counsellor",
  CLINICIAN: "Clinician",
  INSTITUTION_ADMIN: "Administrator",
  SUPPORT_STAFF: "Support staff",
  PLATFORM_ADMIN: "Platform administrator",
};

const PROFESSION_LABEL: Record<string, string> = {
  COUNSELLOR: "Counsellor",
  COUNSELLING_PSYCHOLOGIST: "Counselling psychologist",
  CLINICAL_PSYCHOLOGIST: "Clinical psychologist",
  PSYCHIATRIST: "Psychiatrist",
};

/** Plain names for sign-in events; unknown codes are shown as recorded. */
const AUTH_EVENT_LABEL: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sign_out": "Signed out",
  "auth.sign_in_failed": "Sign-in failed",
  "auth.locked": "Account locked after failed attempts",
  "auth.mfa_enrolled": "Two-step sign-in set up",
  "auth.mfa_failed": "Two-step code rejected",
  "auth.password_set": "Password set",
  "auth.register": "Registered",
};

function fmtMetadata(meta: Record<string, string | number | boolean | null> | null): string {
  if (!meta) return "";
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${v === null ? "none" : String(v)}`)
    .join(", ");
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireInstitutionAdmin();
  const { id } = await params;
  const history = await orNotFound(getAccessHistory(actor, id));
  const p = history.person;
  const isSelf = p.id === actor.userId;
  const profile =
    p.professional && (p.role === "COUNSELLOR" || p.role === "CLINICIAN") ? await getProfessionalProfile(actor, p.id) : null;

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${ROLE_LABEL[p.role]}. Directory details and sign-in history only.`}
        back={{ href: p.role === "STUDENT" ? "/admin/users?tab=students" : "/admin/users?tab=staff", label: "People" }}
      />

      <div className="grid gap-6">
        <Panel title="Account">
          <KeyValueList
            items={[
              { label: "Email", value: p.email },
              { label: "Role", value: ROLE_LABEL[p.role] },
              {
                label: "Status",
                value:
                  p.status === "SUSPENDED" ? (
                    <StatusPill tone="danger">Suspended</StatusPill>
                  ) : p.hasPassword ? (
                    <StatusPill tone="accent">Active</StatusPill>
                  ) : (
                    <StatusPill tone="warning">Invited, no password yet</StatusPill>
                  ),
              },
              ...(p.role === "STUDENT"
                ? [
                    { label: "Department", value: p.department ?? "-" },
                    { label: "Year", value: p.academicYear ?? "-" },
                  ]
                : [{ label: "Two-step sign-in", value: p.mfaEnrolled ? "Set up" : "Not set up" }]),
              { label: "Account created", value: <When date={p.createdAt} /> },
              { label: "Last sign-in", value: p.lastLoginAt ? <When date={p.lastLoginAt} /> : "Never" },
            ]}
          />
          {isSelf ? (
            <p className="mt-4 text-sm text-ink-3">This is your account. Another administrator must suspend it or reset its access.</p>
          ) : (
            <div className="mt-5 flex flex-wrap items-start gap-4 border-t border-line pt-4">
              {p.status === "ACTIVE" ? (
                <>
                  <RowActionForm
                    action={resetAccessAction}
                    fields={{ userId: p.id }}
                    label="Reset access"
                    pendingLabel="Resetting"
                    confirmText={`Reset access for ${p.name}? They will be signed out, their two-step sign-in will be removed, and you will get a new one-time link to give them.`}
                  />
                  <RowActionForm
                    action={suspendUserAction}
                    fields={{ userId: p.id }}
                    label="Suspend account"
                    variant="danger"
                    pendingLabel="Suspending"
                    confirmText={`Suspend ${p.name}? They will be signed out and cannot sign in until reactivated.`}
                  />
                </>
              ) : (
                <RowActionForm action={reactivateUserAction} fields={{ userId: p.id }} label="Reactivate account" pendingLabel="Reactivating" />
              )}
            </div>
          )}
        </Panel>

        {profile ? (
          <Panel title="Professional registration" description="Students see verified professionals when booking.">
            <KeyValueList
              items={[
                { label: "Profession", value: PROFESSION_LABEL[profile.profession] ?? profile.profession },
                { label: "Qualifications", value: profile.qualifications },
                { label: "Registration body", value: profile.registrationBody ?? "Not given" },
                { label: "Registration number", value: profile.registrationNumber ?? "Not given" },
                {
                  label: "Verification",
                  value:
                    profile.verification === "VERIFIED" ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <StatusPill tone="accent">Verified</StatusPill>
                        {profile.verifiedAt ? <When date={profile.verifiedAt} /> : null}
                      </span>
                    ) : profile.verification === "SUSPENDED" ? (
                      <StatusPill tone="danger">Suspended</StatusPill>
                    ) : (
                      <StatusPill tone="warning">Pending</StatusPill>
                    ),
                },
              ]}
            />
            {profile.verification !== "VERIFIED" ? (
              <div className="mt-5 border-t border-line pt-4">
                <VerifyProfessionalForm
                  action={verifyProfessionalAction}
                  userId={p.id}
                  registrationBody={profile.registrationBody ?? ""}
                  registrationNumber={profile.registrationNumber ?? ""}
                />
              </div>
            ) : null}
          </Panel>
        ) : null}

        <Panel title="Sessions" description="Signed-in devices. Suspending or resetting access ends all of them.">
          {history.sessions.length ? (
            <Table caption={`Sessions for ${p.name}`}>
              <thead>
                <tr>
                  <Th>Started</Th>
                  <Th>Last seen</Th>
                  <Th>Expires</Th>
                  <Th>Stage</Th>
                  <Th>Browser</Th>
                </tr>
              </thead>
              <tbody>
                {history.sessions.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <When date={s.createdAt} />
                    </Td>
                    <Td>
                      <When date={s.lastSeenAt} />
                    </Td>
                    <Td>
                      <When date={s.expiresAt} />
                    </Td>
                    <Td>{s.stage === "MFA_PENDING" ? "Waiting for second step" : "Signed in"}</Td>
                    <Td className="max-w-[18rem] break-words text-ink-2">{s.userAgent ?? "Unknown"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No active sessions">This person is not signed in anywhere.</EmptyState>
          )}
        </Panel>

        <Panel title="Sign-in history" description="Sign-in, sign-out and security events from the audit log.">
          {history.events.length ? (
            <Table caption={`Sign-in events for ${p.name}`}>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Event</Th>
                  <Th>Recorded by</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {history.events.map((e) => (
                  <tr key={e.seq}>
                    <Td>
                      <When date={e.createdAt} />
                    </Td>
                    <Td>
                      {AUTH_EVENT_LABEL[e.action] ?? e.action}
                      <p className="mt-0.5 font-mono text-xs text-ink-3">{e.action}</p>
                    </Td>
                    <Td>{e.byThisPerson ? "This person" : (e.actorRole ?? "System")}</Td>
                    <Td className="font-mono text-xs text-ink-2">{fmtMetadata(e.metadata) || "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No sign-in events yet" />
          )}
        </Panel>
      </div>
    </>
  );
}
