import { VideoCameraIcon } from "@phosphor-icons/react/dist/ssr";
import { ActionForm } from "@/components/telehealth/action-form";
import { orNotFound } from "@/components/telehealth/or-not-found";
import { ButtonLink, Field, Fieldset, KeyValueList, Notice, PageHeader, Panel, Select, StatusPill, cx } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireStudent } from "@/lib/auth/guards";
import { DAY, now } from "@/lib/clock";
import { fmtTime, fmtWeekday } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { getCareText } from "@/lib/i18n/care";
import { joinStateOf } from "@/lib/services/consultations";
import { getOwnAppointment, listOpenSlots } from "@/lib/services/scheduling";
import { cancelAppointmentAction, rescheduleAppointmentAction } from "@/app/student/appointments/[id]/actions";

export const metadata = { title: "Appointment" };

const CANCEL_REASON_KEYS = ["SCHEDULE_CONFLICT", "FEELING_BETTER", "NO_LONGER_NEEDED", "OTHER"] as const;

export default async function StudentAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const c = getCareText(actor.locale);
  const locale = actor.locale;

  const appt = await orNotFound(getOwnAppointment(actor, id));
  const t0 = now();
  const state = joinStateOf(appt, t0);
  const changeable = appt.status === "BOOKED" && appt.startsAt.getTime() > t0.getTime();
  const isVideo = appt.mode === "VIDEO";

  const otherSlots = changeable
    ? await listOpenSlots(actor, { professionalId: appt.professionalId, from: t0, to: new Date(t0.getTime() + 14 * DAY) })
    : [];

  return (
    <div className="grid max-w-3xl gap-8">
      <PageHeader title={c.detailsTitle} back={{ href: "/student/care", label: c.backToCare }} />

      {query.booked ? <Notice tone="success" role="status">{t.care.booked}</Notice> : null}
      {query.moved ? <Notice tone="success" role="status">{t.care.rescheduled}</Notice> : null}

      <Panel>
        <KeyValueList
          items={[
            { label: c.withLabel, value: appt.professional.name },
            { label: c.whenLabel, value: fill(c.confirmWhen, { day: fmtWeekday(appt.startsAt, locale), time: fmtTime(appt.startsAt, locale) }) },
            { label: c.formatLabel, value: isVideo ? t.care.video : t.care.inPerson },
            {
              label: c.statusLabel,
              value: <StatusPill tone={appt.status === "BOOKED" ? "accent" : "neutral"}>{t.care.statuses[appt.status]}</StatusPill>,
            },
          ]}
        />
      </Panel>

      {appt.status === "BOOKED" ? (
        isVideo ? (
          <section className="grid gap-3" aria-labelledby="join-heading">
            <h2 id="join-heading" className="text-lg font-semibold tracking-tight">
              {t.care.join}
            </h2>
            <p className="max-w-[65ch] text-ink-2">{c.joinHelp}</p>
            {state === "open" ? (
              <div>
                <ButtonLink href={`/consult/${appt.id}`}>
                  <VideoCameraIcon size={20} aria-hidden />
                  {t.care.join}
                </ButtonLink>
              </div>
            ) : state === "too_early" ? (
              <p className="text-sm text-ink-3">{t.care.joinOpens}</p>
            ) : (
              <p className="text-sm text-ink-3">{c.consult.closed}</p>
            )}
            <p className="text-sm text-ink-3">{c.recordingOff}</p>
          </section>
        ) : (
          <p className="max-w-[65ch] text-ink-2">{c.inPersonNote}</p>
        )
      ) : null}

      {changeable ? (
        <>
          <section className="grid gap-3" aria-labelledby="reschedule-heading">
            <h2 id="reschedule-heading" className="text-lg font-semibold tracking-tight">
              {t.care.reschedule}
            </h2>
            <p className="max-w-[65ch] text-ink-2">{c.rescheduleHelp}</p>
            {otherSlots.length === 0 ? (
              <p className="text-sm text-ink-3">{c.rescheduleNone}</p>
            ) : (
              <ActionForm action={rescheduleAppointmentAction}>
                <input type="hidden" name="appointmentId" value={appt.id} />
                <Fieldset legend={c.openTimes}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {otherSlots.map((s) => (
                      <label
                        key={s.id}
                        className={cx(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line-input bg-surface px-3 py-2 text-sm",
                          "has-[:checked]:border-accent has-[:checked]:bg-accent-soft",
                        )}
                      >
                        <input type="radio" name="slotId" value={s.id} required className="size-4 accent-accent" />
                        <span>
                          {fmtWeekday(s.startsAt, locale)}, {fmtTime(s.startsAt, locale)}
                          <span className="text-ink-3">, {s.mode === "VIDEO" ? t.care.video : t.care.inPerson}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Fieldset>
                <div>
                  <SubmitButton pendingLabel={c.moving}>{c.moveButton}</SubmitButton>
                </div>
              </ActionForm>
            )}
          </section>

          <section className="grid gap-3" aria-labelledby="cancel-heading">
            <h2 id="cancel-heading" className="text-lg font-semibold tracking-tight">
              {t.care.cancel}
            </h2>
            <p className="max-w-[65ch] text-ink-2">{c.cancelHelp}</p>
            <ActionForm action={cancelAppointmentAction}>
              <input type="hidden" name="appointmentId" value={appt.id} />
              <Field id="cancel-reason" label={c.cancelReasonLabel} optionalLabel={t.common.optional}>
                <Select id="cancel-reason" name="reason" defaultValue="">
                  <option value="">{"\u00a0"}</option>
                  {CANCEL_REASON_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {c.cancelReasons[key]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <SubmitButton variant="secondary" pendingLabel={c.cancelling}>
                  {t.care.cancel}
                </SubmitButton>
              </div>
            </ActionForm>
          </section>
        </>
      ) : appt.status === "BOOKED" ? (
        <p className="text-sm text-ink-3">{c.cantChange}</p>
      ) : null}

      <p>
        <ButtonLink variant="ghost" href="/help-now">
          {c.helpNow}
        </ButtonLink>
      </p>
    </div>
  );
}
