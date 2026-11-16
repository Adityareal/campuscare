import Link from "next/link";
import { MapPinIcon, SealCheckIcon, VideoCameraIcon } from "@phosphor-icons/react/dist/ssr";
import { ActionForm } from "@/components/telehealth/action-form";
import { ButtonLink, KeyValueList, Notice, PageHeader, Panel, SectionHeading, StatusPill, cx, linkClass } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireStudent } from "@/lib/auth/guards";
import { now } from "@/lib/clock";
import { fmtDay, fmtTime, fmtWeekday, isoDay } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { getCareText } from "@/lib/i18n/care";
import { listDirectory, type DirectorySlot } from "@/lib/services/professionals";
import { listOwnAppointments, listRecommendedReferrals } from "@/lib/services/scheduling";
import { bookAppointmentAction, declineReferralAction } from "@/app/student/care/actions";

export const metadata = { title: "Care and appointments" };

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : null;
}

function groupByDay(slots: DirectorySlot[]): { day: string; at: Date; slots: DirectorySlot[] }[] {
  const days = new Map<string, { day: string; at: Date; slots: DirectorySlot[] }>();
  for (const s of slots) {
    const key = isoDay(s.startsAt);
    const group = days.get(key) ?? { day: key, at: s.startsAt, slots: [] };
    group.slots.push(s);
    days.set(key, group);
  }
  return [...days.values()];
}

export default async function StudentCarePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireStudent();
  const params = await searchParams;
  const t = getDictionary(actor.locale);
  const c = getCareText(actor.locale);
  const locale = actor.locale;
  const t0 = now();

  const [recommended, directory, appointments] = await Promise.all([
    listRecommendedReferrals(actor),
    listDirectory(actor),
    listOwnAppointments(actor),
  ]);

  const referralParam = first(params.referral);
  const activeReferral = recommended.find((r) => r.id === referralParam) ?? null;
  const slotParam = first(params.slot);
  const selected = slotParam
    ? directory.flatMap((p) => p.slots.map((s) => ({ slot: s, professional: p }))).find((x) => x.slot.id === slotParam) ?? null
    : null;
  const slotGone = !!slotParam && !selected;

  const upcoming = appointments.filter((a) => a.status === "BOOKED" && a.endsAt.getTime() > t0.getTime()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = appointments.filter((a) => !upcoming.includes(a)).slice(0, 5);
  const modeLabel = (mode: "VIDEO" | "IN_PERSON") => (mode === "VIDEO" ? t.care.video : t.care.inPerson);

  return (
    <div className="grid gap-10">
      <PageHeader title={t.care.title} description={c.intro} />

      {first(params.declined) ? <Notice tone="success" role="status">{c.suggestionSetAside}</Notice> : null}
      {first(params.cancelled) ? <Notice tone="success" role="status">{t.care.cancelled}</Notice> : null}

      <section aria-labelledby="recommended-heading">
        <SectionHeading>
          <span id="recommended-heading">{t.care.recommended}</span>
        </SectionHeading>
        {recommended.length === 0 ? (
          <p className="text-ink-2">{c.noRecommendations}</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {recommended.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{t.care.services[r.service]}</p>
                  <p className="text-sm text-ink-3">{fill(t.care.suggestedOn, { day: fmtDay(r.createdAt, locale) })}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ButtonLink href={`/student/care?referral=${r.id}#professionals`}>{t.care.chooseTime}</ButtonLink>
                  <ActionForm action={declineReferralAction} className="grid">
                    <input type="hidden" name="referralId" value={r.id} />
                    <SubmitButton variant="secondary">{t.care.notNow}</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeReferral ? (
        <Notice
          tone="info"
          action={
            <Link href="/student/care#professionals" className={linkClass}>
              {c.clearSuggestion}
            </Link>
          }
        >
          {c.bookingForSuggestion} {t.care.services[activeReferral.service]}.
        </Notice>
      ) : null}

      {slotGone ? <Notice tone="warning" role="status">{t.care.noSlots}</Notice> : null}

      {selected ? (
        <section id="confirm" aria-labelledby="confirm-heading">
          <Panel title={<span id="confirm-heading">{c.confirmTitle}</span>}>
            <KeyValueList
              items={[
                { label: c.withLabel, value: fill(c.confirmWith, { name: selected.professional.name }) },
                { label: c.whenLabel, value: fill(c.confirmWhen, { day: fmtWeekday(selected.slot.startsAt, locale), time: fmtTime(selected.slot.startsAt, locale) }) },
                { label: c.confirmFormat, value: modeLabel(selected.slot.mode) },
                {
                  label: t.care.fee,
                  value: selected.professional.feeInr === 0 ? t.care.covered : fill(c.perSession, { amount: selected.professional.feeInr }),
                },
              ]}
            />
            <ActionForm action={bookAppointmentAction} className="mt-5 flex flex-wrap items-start gap-3">
              <input type="hidden" name="slotId" value={selected.slot.id} />
              {activeReferral ? <input type="hidden" name="referralId" value={activeReferral.id} /> : null}
              <SubmitButton pendingLabel={c.confirming}>{c.confirmButton}</SubmitButton>
              <ButtonLink variant="secondary" href={activeReferral ? `/student/care?referral=${activeReferral.id}#professionals` : "/student/care#professionals"}>
                {c.changeTime}
              </ButtonLink>
            </ActionForm>
          </Panel>
        </section>
      ) : null}

      <section id="professionals" aria-labelledby="professionals-heading" className="scroll-mt-4">
        <SectionHeading>
          <span id="professionals-heading">{t.care.professionals}</span>
        </SectionHeading>
        <p className="mb-4 max-w-[65ch] text-ink-2">{c.directoryIntro}</p>
        {directory.length === 0 || directory.every((p) => p.slots.length === 0) ? (
          <div className="rounded-panel border border-dashed border-line px-5 py-6">
            <p className="text-ink-2">{c.noProfessionals}</p>
            <Link href="/student/help" className={cx(linkClass, "mt-3 inline-block")}>
              {c.askTeam}
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {directory.map((p) => (
              <article key={p.userId} className="rounded-panel border border-line bg-surface px-5 py-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <StatusPill tone="accent">
                    <SealCheckIcon size={14} weight="bold" className="mr-1" aria-hidden />
                    {t.care.verified}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-ink-2">{c.professions[p.profession]}</p>
                <KeyValueList
                  className="mt-4"
                  items={[
                    { label: c.qualifications, value: p.qualifications },
                    ...(p.registrationBody || p.registrationNumber
                      ? [{ label: c.registration, value: [p.registrationBody, p.registrationNumber].filter(Boolean).join(" ") }]
                      : []),
                    ...(p.languages.length ? [{ label: t.care.languages, value: p.languages.join(", ") }] : []),
                    { label: t.care.fee, value: p.feeInr === 0 ? t.care.covered : fill(c.perSession, { amount: p.feeInr }) },
                  ]}
                />
                {p.bio ? <p className="mt-4 max-w-[65ch] text-sm text-ink-2">{p.bio}</p> : null}
                <h4 className="mb-2 mt-5 text-sm font-medium text-ink">{c.openTimes}</h4>
                {p.slots.length === 0 ? (
                  <p className="text-sm text-ink-3">{t.care.noSlots}</p>
                ) : (
                  <div className="grid gap-4">
                    {groupByDay(p.slots).map((g) => (
                      <div key={g.day}>
                        <p className="mb-2 text-sm text-ink-3">{fmtWeekday(g.at, locale)}</p>
                        <ul className="flex flex-wrap gap-2">
                          {g.slots.map((s) => (
                            <li key={s.id}>
                              <ButtonLink
                                size="sm"
                                variant={selected?.slot.id === s.id ? "primary" : "secondary"}
                                href={`/student/care?slot=${s.id}${activeReferral ? `&referral=${activeReferral.id}` : ""}#confirm`}
                                aria-label={`${fmtWeekday(s.startsAt, locale)}, ${fmtTime(s.startsAt, locale)}, ${modeLabel(s.mode)}`}
                              >
                                {s.mode === "VIDEO" ? <VideoCameraIcon size={16} aria-hidden /> : <MapPinIcon size={16} aria-hidden />}
                                {fmtTime(s.startsAt, locale)}
                              </ButtonLink>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="appointments-heading">
        <SectionHeading>
          <span id="appointments-heading">{t.care.yourAppointments}</span>
        </SectionHeading>
        {upcoming.length === 0 ? (
          <p className="text-ink-2">{c.noUpcomingCare}</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {upcoming.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {fmtWeekday(a.startsAt, locale)}, {fmtTime(a.startsAt, locale)}
                  </p>
                  <p className="text-sm text-ink-3">
                    {a.professional.name}, {modeLabel(a.mode)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone="accent">{t.care.statuses[a.status]}</StatusPill>
                  <Link href={`/student/appointments/${a.id}`} className={linkClass}>
                    {c.viewDetails}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {past.length > 0 ? (
          <div className="mt-8">
            <h3 className="mb-3 text-base font-semibold">{t.care.past}</h3>
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {past.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <p className="text-sm">
                    {fmtDay(a.startsAt, locale)}, {fmtTime(a.startsAt, locale)}, {a.professional.name}
                  </p>
                  <div className="flex items-center gap-3">
                    <StatusPill>{t.care.statuses[a.status]}</StatusPill>
                    <Link href={`/student/appointments/${a.id}`} className={cx(linkClass, "text-sm")}>
                      {c.viewDetails}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
