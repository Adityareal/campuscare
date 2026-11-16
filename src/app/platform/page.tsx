import type { Metadata } from "next";
import { CreateInstitutionForm } from "@/components/admin/forms";
import { EmptyState, PageHeader, Panel, Table, Td, Th, When } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listInstitutions } from "@/lib/services/platform";
import { createInstitutionAction } from "./actions";

export const metadata: Metadata = { title: "Institutions" };

export default async function PlatformPage() {
  const actor = await requirePlatformAdmin();
  const institutions = await listInstitutions(actor);

  return (
    <>
      <PageHeader
        title="Institutions"
        description="Tenants on this CampusCare installation. Platform administrators manage tenants only and have no access to any student or clinical record."
      />

      <div className="grid gap-6">
        {institutions.length ? (
          <Table caption="Institutions with account counts">
            <thead>
              <tr>
                <Th>Institution</Th>
                <Th>City</Th>
                <Th>Email domain</Th>
                <Th>Created</Th>
                <Th>Students</Th>
                <Th>Staff</Th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <span className="font-medium">{i.name}</span>
                    <p className="mt-0.5 font-mono text-xs text-ink-3">{i.slug}</p>
                  </Td>
                  <Td>{i.city}</Td>
                  <Td>{i.emailDomain}</Td>
                  <Td>
                    <When date={i.createdAt} />
                  </Td>
                  <Td className="font-mono tabular-nums">{i.students.toLocaleString("en-IN")}</Td>
                  <Td className="font-mono tabular-nums">{i.staff.toLocaleString("en-IN")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No institutions yet">Create the first institution below.</EmptyState>
        )}

        <Panel
          title="Create an institution"
          description="Creates the tenant with default settings and its first administrator. The administrator sets a password and two-step sign-in with a one-time link."
        >
          <CreateInstitutionForm action={createInstitutionAction} />
        </Panel>
      </div>
    </>
  );
}
