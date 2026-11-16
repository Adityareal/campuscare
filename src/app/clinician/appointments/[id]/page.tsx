import { ActionForm } from "@/components/telehealth/action-form";
import { orNotFound } from "@/components/telehealth/or-not-found";
import { ButtonLink, Field, Fieldset, Input, KeyValueList, Notice, PageHeader, Panel, Select, StatusPill, Textarea, When } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireClinician } from "@/lib/auth/guards";
import { now } from "@/lib/clock";
import { fmtDateTime, fmtTime, fmtWeekday, isoDay } from "@/lib/format";
import { listClinicalNotes, NOTE_KIND_LABELS, NOTE_KINDS, type NoteKind } from "@/lib/services/clinical-notes";
import { FOLLOW_UP_KINDS, joinStateOf } from "@/lib/services/consultations";
import { getClinicianAppointment } from "@/lib/services/scheduling";
import { addClinicalNoteAction, completeConsultationAction } from "@/app/clinician/appointments/[id]/actions";

export const metadata = { title: "Appointment" };

const STATUS = {
  BOOKED: { label: "Booked", tone: "accent" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No show", tone: "warning" },
} as const;

const SERVICE_LABEL: Record<string, string> = {
  CAMPUS_COUNSELLING: "Campus counselling",
  CLINICAL_PSYCHOLOGY: "Clinical psychology",
  PSYCHIATRY: "Psychiatry",
  EXTERNAL_SERVICE: "External service",
};

const CONSULTATION_STATUS: Record<string, string> = {
  WAITING: "Waiting room",
  IN_PROGRESS: "In progress",
  ENDED: "Ended",
};

export default async function ClinicianAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireClinician();
  const appt = await orNotFound(getClinicianAppointment(actor, id));
  const notes = await listClinicalNotes(actor, appt.studentId);
  const t0 = now();
  const joinState = joinStateOf(appt, t0);
  const canRecord = appt.status === "BOOKED" && t0.getTime() >= appt.startsAt.getTime() - 15 * 60_000;
  const noteKinds = NOTE_KINDS as readonly NoteKind[];

  return (
    <div className="grid max-w-4xl gap-8">
      <PageHeader title="Appointment" back={{ href: "/clinician", label: "Back to schedule" }} />

      <Panel title={appt.student.name}>
        <KeyValueList
          items={[
            { label: "Department", value: appt.student.student?.department.name ?? "Not recorded" },
            { label: "When", value: <When date={appt.startsAt}>{`${fmtWeekday(appt.startsAt)}, ${fmtTime(appt.startsAt)} to ${fmtTime(appt.endsAt)}`}</When> },
            { label: "Format", value: appt.mode === "VIDEO" ? "Video" : "In person" },
            { label: "Status", value: <StatusPill tone={STATUS[appt.status].tone}>{STATUS[appt.status].label}</StatusPill> },
            ...(appt.mode === "VIDEO"
              ? [{ label: "Consultation", value: appt.consultation ? (CONSULTATION_STATUS[appt.consultation.status] ?? appt.consultation.status) : "Not started" }]
              : []),
            ...(appt.consultation?.studentJoinedAt ? [{ label: "Student joined", value: fmtDateTime(appt.consultation.studentJoinedAt) }] : []),
            ...(appt.referral
              ? [
                  { label: "Referral", value: SERVICE_LABEL[appt.referral.service] ?? appt.referral.service },
                  { label: "Reason given", value: appt.referral.reason ? <span className="whitespace-pre-wrap">{appt.referral.reason}</span> : "None recorded" },
                ]
              : []),
          ]}
        />
        {appt.mode === "VIDEO" && appt.status === "BOOKED" ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ButtonLink href={`/consult/${appt.id}`} variant={joinState === "open" ? "primary" : "secondary"}>
              Open room
            </ButtonLink>
            <p className="text-sm text-ink-3">
              {joinState === "open"
                ? "The room is open. Sessions are never recorded."
                : joinState === "too_early"
                  ? "The room opens 15 minutes before the start. Sessions are never recorded."
                  : "The joining window has closed. Sessions are never recorded."}
            </p>
          </div>
        ) : null}
      </Panel>

      <section aria-labelledby="outcome-heading" className="grid gap-3">
        <h2 id="outcome-heading" className="text-lg font-semibold tracking-tight">
          Consultation outcome
        </h2>
        {appt.status === "BOOKED" ? (
          canRecord ? (
            <ActionForm action={completeConsultationAction} className="grid max-w-xl gap-4">
              <input type="hidden" name="appointmentId" value={appt.id} />
              <Fieldset legend="Did the student attend?">
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="radio" name="outcome" value="attended" required className="size-4 accent-accent" />
                  Attended
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="radio" name="outcome" value="no_show" required className="size-4 accent-accent" />
                  Did not attend
                </label>
              </Fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="follow-up-date" label="Follow-up date" optionalLabel="Optional">
                  <Input id="follow-up-date" name="followUpDate" type="date" min={isoDay(t0)} />
                </Field>
                <Field id="follow-up-kind" label="Follow-up type" hint="Used only when a date is set.">
                  <Select id="follow-up-kind" name="followUpKind" defaultValue="CHECK_IN">
                    {Object.entries(FOLLOW_UP_KINDS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div>
                <SubmitButton pendingLabel="Saving">Record outcome</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-ink-2">You can record the outcome from 15 minutes before the start time.</p>
          )
        ) : (
          <p className="text-ink-2">
            Outcome recorded: {STATUS[appt.status].label.toLowerCase()}.
          </p>
        )}
      </section>

      <section aria-labelledby="notes-heading" className="grid gap-4">
        <div>
          <h2 id="notes-heading" className="text-lg font-semibold tracking-tight">
            Clinical notes
          </h2>
          <p className="mt-1 max-w-[65ch] text-sm text-ink-3">
            Only clinicians who have an appointment with this student can read these notes. Each time you open this list it is recorded in the audit log.
          </p>
        </div>

        {notes.length === 0 ? (
          <p className="text-ink-2">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {notes.map((n) => (
              <li key={n.id} className="grid gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusPill>{NOTE_KIND_LABELS[n.kind as NoteKind] ?? n.kind}</StatusPill>
                  <span className="text-sm text-ink-3">
                    {n.authorName}, <When date={n.createdAt} />
                  </span>
                </div>
                <p className="max-w-[70ch] whitespace-pre-wrap text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
        )}

        <ActionForm action={addClinicalNoteAction} className="grid max-w-2xl gap-4">
          <input type="hidden" name="appointmentId" value={appt.id} />
          <Field id="note-kind" label="Note type">
            <Select id="note-kind" name="kind" defaultValue="CONSULTATION">
              {noteKinds.map((k) => (
                <option key={k} value={k}>
                  {NOTE_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="note-body" label="Note">
            <Textarea id="note-body" name="body" required minLength={3} maxLength={8000} rows={6} />
          </Field>
          <div>
            <SubmitButton pendingLabel="Saving">Save note</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <Notice tone="info">Clinical notes stay on clinician pages. They never appear in analytics, reports or exports.</Notice>
    </div>
  );
}
