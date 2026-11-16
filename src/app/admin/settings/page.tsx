import type { Metadata } from "next";
import { CreateDepartmentForm, RenameDepartmentForm, SettingsForm } from "@/components/admin/forms";
import { orNotFound } from "@/components/admin/not-found";
import { EmptyState, KeyValueList, Notice, PageHeader, Panel, When } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import { getAdminSettings } from "@/lib/services/admin";
import { createDepartmentAction, renameDepartmentAction, updateSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Institution settings" };

export default async function SettingsPage() {
  const actor = await requireInstitutionAdmin();
  const s = await orNotFound(getAdminSettings(actor));

  return (
    <>
      <PageHeader title="Institution settings" description="How CampusCare works for your institution. Every change is recorded in the audit log." />

      <div className="grid gap-6">
        <Panel title="Institution profile" description="Contact the platform team to change the name or email domain.">
          <KeyValueList
            items={[
              { label: "Name", value: s.institution.name },
              { label: "Short name", value: <span className="font-mono">{s.institution.slug}</span> },
              { label: "City", value: s.institution.city },
              { label: "Email domain", value: s.institution.emailDomain },
              { label: "Settings last changed", value: <When date={s.updatedAt} /> },
            ]}
          />
        </Panel>

        <Panel title="Departments" description="Students choose a department when they register. Renaming keeps all existing students in the department.">
          <div className="grid gap-6">
            {s.departments.length ? (
              <ul className="grid gap-5">
                {s.departments.map((d) => (
                  <li key={d.id} className="grid gap-1 border-b border-line pb-5">
                    <RenameDepartmentForm action={renameDepartmentAction} departmentId={d.id} name={d.name} code={d.code} />
                    <p className="text-sm text-ink-3">
                      Code <span className="font-mono">{d.code}</span>. {d.students} {d.students === 1 ? "student" : "students"}.
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No departments yet">Add at least one department before inviting students.</EmptyState>
            )}
            <div className="grid gap-3">
              <h3 className="text-base font-semibold">Add a department</h3>
              <CreateDepartmentForm action={createDepartmentAction} />
            </div>
          </div>
        </Panel>

        <Panel title="Care settings">
          <SettingsForm
            action={updateSettingsAction}
            initial={{
              checkInCadence: s.checkInCadence,
              careTeamHours: s.careTeamHours,
              campusContacts: s.campusContacts,
              onCallResponderId: s.onCallResponderId,
              urgentAckMinutes: s.urgentAckMinutes,
              priorityAckHours: s.priorityAckHours,
              monitorAckHours: s.monitorAckHours,
              minCohortSize: s.minCohortSize,
              retentionMonths: s.retentionMonths,
            }}
            responders={s.responders.map((r) => ({ id: r.id, name: r.name, roleLabel: r.role === "CLINICIAN" ? "Clinician" : "Counsellor" }))}
          />
        </Panel>

        <Panel title="Triage rules">
          <KeyValueList items={[{ label: "Rules version in use", value: <span className="font-mono">{s.riskRulesVersion}</span> }]} />
          <Notice tone="info" className="mt-4" title="Clinicians configure triage rules">
            The rules that raise alerts are clinical decisions. Clinicians review and change them under Triage rules in their
            workspace. Administrators can see which version is in use but cannot change it.
          </Notice>
        </Panel>
      </div>
    </>
  );
}
