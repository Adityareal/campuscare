import Link from "next/link";
import { StatusPill, Table, Td, Th, TriageBadge, When, Ref, linkClass } from "@/components/ui";
import { ALERT_STATUS_LABEL, DEPARTMENT_NONE } from "@/components/care/labels";
import type { listAlerts } from "@/lib/services/alerts";

type AlertRows = Awaited<ReturnType<typeof listAlerts>>;

/** Queue of alerts with the student, raised time, assignee and status in text. */
export function AlertTable({ rows, caption }: { rows: AlertRows; caption: string }) {
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>Category</Th>
          <Th>Alert</Th>
          <Th>Student</Th>
          <Th>Raised</Th>
          <Th>Assigned to</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <Td>
              <TriageBadge category={a.category} size="sm" />
            </Td>
            <Td>
              <Link href={`/counsellor/alerts/${a.id}`} className={linkClass}>
                {a.title}
              </Link>
              <p className="mt-1">
                <Ref>{a.reference}</Ref>
              </p>
            </Td>
            <Td>
              <p className="font-medium">{a.student.name}</p>
              <p className="text-ink-3">
                {a.student.student ? `${a.student.student.department.name}, year ${a.student.student.academicYear}` : DEPARTMENT_NONE}
              </p>
            </Td>
            <Td>
              <When date={a.createdAt} />
            </Td>
            <Td>{a.assignedTo?.name ?? <span className="text-ink-3">Unassigned</span>}</Td>
            <Td>
              <div className="flex flex-wrap items-center gap-2">
                <span>{ALERT_STATUS_LABEL[a.status]}</span>
                {a.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : null}
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
