import Link from "next/link";
import { ButtonLink, EmptyState, PageHeader, StatusPill, Table, Td, Th, When, linkClass } from "@/components/ui";
import { requireClinician } from "@/lib/auth/guards";
import { DAY, now } from "@/lib/clock";
import { fmtTime, fmtWeekday, isoDay, istToUtc } from "@/lib/format";
import { listClinicianSchedule } from "@/lib/services/scheduling";

export const metadata = { title: "Schedule" };

type Row = Awaited<ReturnType<typeof listClinicianSchedule>>[number];

const STATUS = {
  BOOKED: { label: "Booked", tone: "accent" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No show", tone: "warning" },
} as const;

function ScheduleTable({ caption, rows }: { caption: string; rows: Row[] }) {
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>When</Th>
          <Th>Student</Th>
          <Th>Format</Th>
          <Th>Status</Th>
          <Th>
            <span className="sr-only">Links</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <Td>
              <When date={a.startsAt}>
                {fmtWeekday(a.startsAt)}, {fmtTime(a.startsAt)}
              </When>
            </Td>
            <Td>{a.student.name}</Td>
            <Td>{a.mode === "VIDEO" ? "Video" : "In person"}</Td>
            <Td>
              <StatusPill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusPill>
            </Td>
            <Td>
              <div className="flex flex-wrap items-center gap-3">
                {a.status === "BOOKED" && a.mode === "VIDEO" ? (
                  <ButtonLink size="sm" href={`/consult/${a.id}`}>
                    Open room
                  </ButtonLink>
                ) : null}
                <Link href={`/clinician/appointments/${a.id}`} className={linkClass}>
                  Appointment
                </Link>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default async function ClinicianHomePage() {
  const actor = await requireClinician();
  const dayStart = istToUtc(isoDay(now()), "00:00");
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const rangeEnd = new Date(dayStart.getTime() + 15 * DAY);
  const rows = await listClinicianSchedule(actor, { from: dayStart, to: rangeEnd });
  const today = rows.filter((a) => a.startsAt.getTime() < dayEnd.getTime());
  const upcoming = rows.filter((a) => a.startsAt.getTime() >= dayEnd.getTime());

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Schedule"
        description="Your appointments for today and the next two weeks."
        actions={
          <ButtonLink variant="secondary" href="/clinician/availability">
            Manage availability
          </ButtonLink>
        }
      />

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Today
        </h2>
        {today.length === 0 ? (
          <EmptyState title="No appointments today">Booked sessions appear here.</EmptyState>
        ) : (
          <ScheduleTable caption="Today's appointments" rows={today} />
        )}
      </section>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing booked in the next two weeks">Add availability so students can book you.</EmptyState>
        ) : (
          <ScheduleTable caption="Upcoming appointments" rows={upcoming} />
        )}
      </section>
    </div>
  );
}
