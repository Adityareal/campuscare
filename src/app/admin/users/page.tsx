import type { Metadata } from "next";
import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { LinkTabs } from "@/components/admin/figure";
import { InviteStaffForm, RowActionForm, StudentInviteForm } from "@/components/admin/forms";
import { EmptyState, PageHeader, Panel, StatusPill, Table, Td, Th, When, buttonClass, inputClass, linkClass } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { listInvites, listPeople, type InviteRow, type PersonRow } from "@/lib/services/admin";
import {
  createStudentInviteAction,
  inviteStaffAction,
  reactivateUserAction,
  revokeInviteAction,
  suspendUserAction,
} from "./actions";

export const metadata: Metadata = { title: "People" };

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  COUNSELLOR: "Counsellor",
  CLINICIAN: "Clinician",
  INSTITUTION_ADMIN: "Administrator",
  SUPPORT_STAFF: "Support staff",
  PLATFORM_ADMIN: "Platform administrator",
};

type Tab = "staff" | "students" | "invites";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function AccountStatus({ person }: { person: PersonRow }) {
  if (person.status === "SUSPENDED") return <StatusPill tone="danger">Suspended</StatusPill>;
  if (!person.hasPassword) return <StatusPill tone="warning">Invited, no password yet</StatusPill>;
  return <StatusPill tone="accent">Active</StatusPill>;
}

function StatusActions({ person, selfId }: { person: PersonRow; selfId: string }) {
  if (person.id === selfId) return <span className="text-sm text-ink-3">Your account</span>;
  return person.status === "ACTIVE" ? (
    <RowActionForm
      action={suspendUserAction}
      fields={{ userId: person.id }}
      label="Suspend"
      pendingLabel="Suspending"
      confirmText={`Suspend ${person.name}? They will be signed out and cannot sign in until reactivated.`}
    />
  ) : (
    <RowActionForm action={reactivateUserAction} fields={{ userId: person.id }} label="Reactivate" pendingLabel="Reactivating" />
  );
}

function SearchForm({ tab, query }: { tab: Tab; query: string }) {
  return (
    <form method="get" action="/admin/users" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="tab" value={tab} />
      <div className="grid flex-1 gap-2">
        <label htmlFor="people-q" className="text-sm font-medium">
          Search by name or email
        </label>
        <input id="people-q" name="q" type="search" defaultValue={query} className={inputClass} maxLength={100} />
      </div>
      <button type="submit" className={buttonClass("secondary")}>
        Search
      </button>
    </form>
  );
}

function StaffTable({ people, selfId }: { people: PersonRow[]; selfId: string }) {
  if (!people.length) return <EmptyState title="No staff found">Invite counsellors, clinicians and administrators below.</EmptyState>;
  return (
    <Table caption="Staff accounts">
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Role</Th>
          <Th>Account</Th>
          <Th>Two-step sign-in</Th>
          <Th>Professional registration</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/admin/users/${p.id}`} className={linkClass}>
                {p.name}
              </Link>
              <p className="mt-0.5 text-ink-3">{p.email}</p>
            </Td>
            <Td>{ROLE_LABEL[p.role]}</Td>
            <Td>
              <AccountStatus person={p} />
            </Td>
            <Td>{p.mfaEnrolled ? "Set up" : "Not set up"}</Td>
            <Td>
              {p.professional ? (
                p.professional.verification === "VERIFIED" ? (
                  <StatusPill tone="accent">Verified</StatusPill>
                ) : p.professional.verification === "SUSPENDED" ? (
                  <StatusPill tone="danger">Suspended</StatusPill>
                ) : (
                  <StatusPill tone="warning">Pending</StatusPill>
                )
              ) : (
                <span className="text-ink-3">No profile</span>
              )}
            </Td>
            <Td>
              <StatusActions person={p} selfId={selfId} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function StudentTable({ people, selfId }: { people: PersonRow[]; selfId: string }) {
  if (!people.length) return <EmptyState title="No students found">Students join with an invite code from the Invite codes tab.</EmptyState>;
  return (
    <Table caption="Student accounts (directory details only)">
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Department</Th>
          <Th>Year</Th>
          <Th>Account</Th>
          <Th>Joined</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {people.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/admin/users/${p.id}`} className={linkClass}>
                {p.name}
              </Link>
              <p className="mt-0.5 text-ink-3">{p.email}</p>
            </Td>
            <Td>{p.department ?? "-"}</Td>
            <Td className="tabular-nums">{p.academicYear ?? "-"}</Td>
            <Td>
              <AccountStatus person={p} />
            </Td>
            <Td>
              <When date={p.createdAt} />
            </Td>
            <Td>
              <StatusActions person={p} selfId={selfId} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const INVITE_STATE: Record<InviteRow["state"], { label: string; tone: "accent" | "neutral" | "warning" }> = {
  active: { label: "Active", tone: "accent" },
  expired: { label: "Expired or revoked", tone: "neutral" },
  used_up: { label: "All uses taken", tone: "warning" },
};

function InviteTable({ invites }: { invites: InviteRow[] }) {
  if (!invites.length) return <EmptyState title="No invite codes yet">Create a code above and share it with students.</EmptyState>;
  return (
    <Table caption="Student invite codes">
      <thead>
        <tr>
          <Th>Code</Th>
          <Th>Used</Th>
          <Th>Expires</Th>
          <Th>State</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {invites.map((i) => (
          <tr key={i.id}>
            <Td className="font-mono">{i.code}</Td>
            <Td className="font-mono tabular-nums">
              {i.uses} of {i.maxUses}
            </Td>
            <Td>
              <When date={i.expiresAt} />
            </Td>
            <Td>
              <StatusPill tone={INVITE_STATE[i.state].tone}>{INVITE_STATE[i.state].label}</StatusPill>
            </Td>
            <Td>
              {i.state === "expired" ? (
                <span className="text-ink-3">None</span>
              ) : (
                <RowActionForm
                  action={revokeInviteAction}
                  fields={{ inviteId: i.id }}
                  label="Revoke"
                  pendingLabel="Revoking"
                  confirmText={`Revoke code ${i.code}? Students will no longer be able to register with it.`}
                />
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireInstitutionAdmin();
  const sp = await searchParams;
  const tabParam = first(sp.tab);
  const tab: Tab = tabParam === "students" || tabParam === "invites" ? tabParam : "staff";
  const query = (first(sp.q) ?? "").slice(0, 100);

  const tabs = [
    { href: "/admin/users?tab=staff", label: "Staff", active: tab === "staff" },
    { href: "/admin/users?tab=students", label: "Students", active: tab === "students" },
    { href: "/admin/users?tab=invites", label: "Invite codes", active: tab === "invites" },
  ];

  return (
    <>
      <PageHeader
        title="People"
        description="Accounts, invitations and access. Administrators see directory details only, never a student's check-ins, questionnaires, cases or messages."
      />
      <div className="grid gap-6">
        <LinkTabs label="People views" items={tabs} />

        {tab === "staff" ? (
          <>
            <SearchForm tab={tab} query={query} />
            <StaffTable people={await listPeople(actor, { role: "STAFF", query })} selfId={actor.userId} />
            <Panel
              title="Invite a staff member"
              description="Creates the account without a password and gives you a one-time link. The person sets a password and two-step sign-in before they can use CampusCare."
            >
              <InviteStaffForm action={inviteStaffAction} />
            </Panel>
          </>
        ) : null}

        {tab === "students" ? (
          <>
            <SearchForm tab={tab} query={query} />
            <StudentTable people={await listPeople(actor, { role: "STUDENT", query })} selfId={actor.userId} />
          </>
        ) : null}

        {tab === "invites" ? (
          <>
            <Panel title="Create a student invite code" description="Students enter the code when they register. Share it through official channels only.">
              <StudentInviteForm action={createStudentInviteAction} />
            </Panel>
            <InviteTable invites={await listInvites(actor)} />
          </>
        ) : null}
      </div>
    </>
  );
}
