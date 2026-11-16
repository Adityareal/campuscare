import { ActionForm } from "@/components/telehealth/action-form";
import { Field, Input, PageHeader, Panel, Select, StatusPill, Table, Td, Th, When } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireClinician } from "@/lib/auth/guards";
import { now } from "@/lib/clock";
import { fmtTime, fmtWeekday, isoDay } from "@/lib/format";
import { listOwnSlots } from "@/lib/services/scheduling";
import { createSlotsAction, removeSlotAction } from "@/app/clinician/availability/actions";

export const metadata = { title: "Availability" };

const SLOT_STATUS = {
  OPEN: { label: "Open", tone: "accent" },
  BOOKED: { label: "Booked", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "neutral" },
} as const;

export default async function AvailabilityPage() {
  const actor = await requireClinician();
  const slots = await listOwnSlots(actor);
  const today = isoDay(now());

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Availability"
        description="Add the times students can book with you. Times are in India Standard Time. A booked time cannot be removed: cancel the appointment instead."
      />

      <Panel title="Add times">
        <ActionForm action={createSlotsAction} className="grid max-w-xl gap-4">
          <Field id="slot-date" label="Date">
            <Input id="slot-date" name="date" type="date" min={today} required />
          </Field>
          <Field id="slot-times" label="Start times" hint="24-hour times separated by commas or spaces, for example 09:00, 09:45, 10:30.">
            <Input id="slot-times" name="times" type="text" inputMode="text" autoComplete="off" required placeholder="09:00, 09:45" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="slot-duration" label="Session length">
              <Select id="slot-duration" name="durationMinutes" defaultValue="45">
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="50">50 minutes</option>
                <option value="60">60 minutes</option>
              </Select>
            </Field>
            <Field id="slot-mode" label="Format">
              <Select id="slot-mode" name="mode" defaultValue="VIDEO">
                <option value="VIDEO">Video</option>
                <option value="IN_PERSON">In person</option>
              </Select>
            </Field>
          </div>
          <div>
            <SubmitButton pendingLabel="Adding">Add times</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <section aria-labelledby="slots-heading">
        <h2 id="slots-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Your upcoming times
        </h2>
        {slots.length === 0 ? (
          <p className="text-ink-2">You have no upcoming times. Add some above so students can book you.</p>
        ) : (
          <Table caption="Your upcoming availability">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Time</Th>
                <Th>Format</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <When date={s.startsAt}>{fmtWeekday(s.startsAt)}</When>
                  </Td>
                  <Td>
                    {fmtTime(s.startsAt)} to {fmtTime(s.endsAt)}
                  </Td>
                  <Td>{s.mode === "VIDEO" ? "Video" : "In person"}</Td>
                  <Td>
                    <StatusPill tone={SLOT_STATUS[s.status].tone}>{SLOT_STATUS[s.status].label}</StatusPill>
                  </Td>
                  <Td>
                    {s.status === "OPEN" ? (
                      <ActionForm action={removeSlotAction} className="grid">
                        <input type="hidden" name="slotId" value={s.id} />
                        <SubmitButton variant="ghost" size="sm" aria-label={`Remove ${fmtWeekday(s.startsAt)} ${fmtTime(s.startsAt)}`}>
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
