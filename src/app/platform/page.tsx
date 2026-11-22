import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BuildingOfficeIcon } from "@phosphor-icons/react/dist/ssr";
import { CreateInstitutionForm } from "@/components/admin/forms";
import { OpenInstitutionForm } from "@/components/platform/open-institution-form";
import { EmptyState, Panel, StatusPill, When } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listInstitutions } from "@/lib/services/platform";
import { createInstitutionAction, enterInstitutionContextAction } from "./actions";

export const metadata: Metadata = { title: "Institutions" };

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid content-start gap-1 rounded-panel border border-line bg-surface px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="font-mono text-2xl font-semibold leading-tight tracking-tight text-ink tabular-nums">{value}</p>
      <p className="text-sm text-ink-3">{detail}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-sm font-medium text-ink-2">{children}</dd>
    </div>
  );
}

export default async function PlatformPage() {
  const actor = await requirePlatformAdmin();
  const institutions = await listInstitutions(actor);
  const totalStudents = institutions.reduce((sum, institution) => sum + institution.students, 0);
  const totalStaff = institutions.reduce((sum, institution) => sum + institution.staff, 0);

  return (
    <div className="grid gap-7">
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">Platform administration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Institution access</h1>
          <p className="mt-2 max-w-[68ch] text-ink-2">
            Open a tenant workspace to manage its people, settings and care records. Every access session is recorded in both audit logs.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink-2">
          Platform admin
        </span>
      </header>

      <section aria-label="Platform totals" className="grid gap-3 sm:grid-cols-3">
        <Metric label="Institutions" value={institutions.length.toLocaleString("en-IN")} detail="Tenant workspaces" />
        <Metric label="Students" value={totalStudents.toLocaleString("en-IN")} detail="Across all institutions" />
        <Metric label="Staff" value={totalStaff.toLocaleString("en-IN")} detail="Care and admin teams" />
      </section>

      <aside role="note" className="flex gap-3 border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm text-accent-text">
        <span className="shrink-0 font-semibold">Audited access</span>
        <p>Choose a reason before opening or switching workspaces. Actions inside remain attributed to your platform administrator account.</p>
      </aside>

      <section className="grid gap-3" aria-labelledby="institution-list-title">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">Tenant directory</p>
            <h2 id="institution-list-title" className="mt-1 text-xl font-semibold tracking-tight">Institution workspaces</h2>
          </div>
          <p className="text-sm text-ink-3">{institutions.length.toLocaleString("en-IN")} listed</p>
        </header>

        {institutions.length ? (
          <div className="overflow-hidden rounded-panel border border-line bg-surface divide-y divide-line">
            {institutions.map((institution) => {
              const isOpen = actor.actingInstitutionId === institution.id;
              return (
                <article key={institution.id} className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.82fr)] lg:items-center">
                  <div className="grid gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text">
                        <BuildingOfficeIcon size={22} weight="duotone" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold leading-snug text-ink">{institution.name}</h3>
                          {isOpen ? <StatusPill tone="info">Workspace open</StatusPill> : null}
                        </div>
                        <p className="mt-1 text-sm text-ink-2">{institution.city} <span aria-hidden="true">·</span> {institution.emailDomain}</p>
                        <p className="mt-0.5 font-mono text-xs text-ink-3">/{institution.slug}</p>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-line pt-3 sm:grid-cols-3 sm:pl-14 sm:border-t-0 sm:pt-0">
                      <Fact label="Students">{institution.students.toLocaleString("en-IN")}</Fact>
                      <Fact label="Staff">{institution.staff.toLocaleString("en-IN")}</Fact>
                      <Fact label="Created"><When date={institution.createdAt} /></Fact>
                    </dl>
                  </div>

                  <div className="grid gap-2 border-t border-line pt-4 lg:border-t-0 lg:pt-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">Workspace</p>
                    {isOpen ? (
                      <div className="flex min-h-11 items-center rounded-control bg-accent-soft px-3 text-sm font-medium text-accent-text">
                        This institution is active in your workspace.
                      </div>
                    ) : (
                      <OpenInstitutionForm
                        action={enterInstitutionContextAction}
                        institutionId={institution.id}
                        institutionName={institution.name}
                        switching={!!actor.actingInstitutionId}
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No institutions yet">Create the first institution below.</EmptyState>
        )}
      </section>

      <Panel
        title="Create an institution"
        description="Set up a tenant with default settings and its first administrator. They receive a one-time link to create a password and enroll in two-step sign-in."
      >
        <CreateInstitutionForm action={createInstitutionAction} />
      </Panel>
    </div>
  );
}
