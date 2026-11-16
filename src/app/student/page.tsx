import Link from "next/link";
import { ContactLinks } from "@/components/student/contacts";
import { StartAssessment } from "@/components/student/start-assessment";
import { TrendChart } from "@/components/charts";
import { ButtonLink, EmptyState, Notice, PageHeader, Panel, SectionHeading, StatusPill, linkClass } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { DAY, now } from "@/lib/clock";
import { fmtDay, fmtTime, fmtWeekday, isoDay } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { instrumentFor } from "@/lib/instruments";
import { notificationText } from "@/lib/services/notifications";
import { getStudentHome } from "@/lib/services/student-home";

/** Notification links come from our own services, but only a path inside the app is rendered as a link. */
function internalLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

export default async function StudentHomePage() {
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);
  const home = await getStudentHome(actor);
  const at = now();
  const locale = actor.locale;

  const { latestCheckIn, settings, consent } = home;
  const cadenceDays = settings.checkInCadence === "WEEKLY" ? 7 : 1;
  const nextDue = latestCheckIn ? new Date(latestCheckIn.createdAt.getTime() + cadenceDays * DAY) : null;
  const checkInDue = !nextDue || nextDue.getTime() <= at.getTime();
  const checkedToday = latestCheckIn ? isoDay(latestCheckIn.createdAt) === isoDay(at) : false;

  const trendSeries = [
    { label: t.history.mood, points: home.trend.map((r) => ({ at: r.createdAt, value: r.mood })) },
    { label: t.history.stress, points: home.trend.map((r) => ({ at: r.createdAt, value: r.stress })) },
    { label: t.history.sleep, points: home.trend.map((r) => ({ at: r.createdAt, value: r.sleep })) },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader title={fill(t.dashboard.greeting, { name: actor.name })} />

      {!consent.CORE_PROCESSING ? (
        <Notice
          tone="warning"
          title={c.home.consentOffTitle}
          action={
            <ButtonLink href="/student/privacy" variant="secondary" size="sm">
              {c.common.reviewPrivacy}
            </ButtonLink>
          }
        >
          {c.home.consentOffBody}
        </Notice>
      ) : null}

      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
        <div className="grid gap-10">
          <section aria-labelledby="checkin-heading" className="grid gap-4">
            <SectionHeading>
              <span id="checkin-heading">{t.dashboard.latestCheckIn}</span>
            </SectionHeading>
            {latestCheckIn ? (
              <div className="grid gap-1 text-ink-2">
                <p>{fill(c.home.lastCheckInOn, { date: fmtDay(latestCheckIn.createdAt, locale) })}</p>
                {latestCheckIn.mood !== null ? <p>{fill(t.dashboard.moodStatus, { mood: latestCheckIn.mood })}</p> : null}
                {checkedToday ? <p className="font-medium text-accent-text">{t.dashboard.checkedInToday}</p> : null}
                {nextDue && !checkInDue ? <p>{fill(t.dashboard.nextCheckIn, { day: fmtWeekday(nextDue, locale) })}</p> : null}
              </div>
            ) : (
              <p className="text-ink-2">{t.dashboard.noCheckInYet}</p>
            )}
            <p className="text-sm text-ink-3">{c.home.checkInPrompt}</p>
            <div>
              <ButtonLink href="/student/check-in" variant={checkInDue ? "primary" : "secondary"}>
                {t.dashboard.checkInCta}
              </ButtonLink>
            </div>
          </section>

          <section aria-labelledby="trend-heading" className="grid gap-3">
            <SectionHeading>
              <span id="trend-heading">{t.dashboard.trendTitle}</span>
            </SectionHeading>
            <TrendChart
              series={trendSeries}
              yMin={1}
              yMax={5}
              ticks={[1, 2, 3, 4, 5]}
              label={c.home.trendLabel}
              locale={locale}
              emptyText={t.dashboard.trendEmpty}
            />
            <p className="text-sm text-ink-3">{c.home.trendNote}</p>
          </section>

          <section aria-labelledby="questionnaire-heading" className="grid gap-4">
            <SectionHeading>
              <span id="questionnaire-heading">{t.dashboard.questionnaires}</span>
            </SectionHeading>
            {home.assessments.length > 0 ? (
              <ul className="grid divide-y divide-line rounded-panel border border-line bg-surface">
                {home.assessments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="grid gap-1">
                      <span className="font-medium">{instrumentFor(a.instrument).name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
                        {a.source === "COUNSELLOR_REQUEST" ? <StatusPill tone="info">{t.dashboard.questionnaireRequested}</StatusPill> : null}
                        {a.dueAt ? <span>{fill(c.home.due, { day: fmtDay(a.dueAt, locale) })}</span> : null}
                      </span>
                    </div>
                    <ButtonLink href={`/student/assessments/${a.id}`} variant="secondary">
                      {c.history.openIt}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">{c.home.noQuestionnaires}</p>
            )}
            <div className="grid gap-2">
              <p className="text-sm font-medium">{t.dashboard.questionnaireSelf}</p>
              <StartAssessment phq9Label={c.home.startPhq9} gad7Label={c.home.startGad7} pending={c.home.startingQuestionnaire} />
              <p className="text-sm text-ink-3">
                {c.home.selfHint} {t.common.notDiagnosis}
              </p>
            </div>
          </section>

          <section aria-labelledby="appointments-heading" className="grid gap-3">
            <SectionHeading>
              <span id="appointments-heading">{t.dashboard.upcoming}</span>
            </SectionHeading>
            {home.appointments.length > 0 ? (
              <ul className="grid divide-y divide-line rounded-panel border border-line bg-surface">
                {home.appointments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="grid gap-0.5">
                      <span className="font-medium">
                        <time dateTime={a.startsAt.toISOString()}>
                          {fmtWeekday(a.startsAt, locale)}, {fmtTime(a.startsAt, locale)}
                        </time>
                      </span>
                      <span className="text-sm text-ink-3">
                        {fill(c.home.withProfessional, { name: a.professional.name })}. {a.mode === "VIDEO" ? t.care.video : t.care.inPerson}
                      </span>
                    </div>
                    <ButtonLink href={`/student/appointments/${a.id}`} variant="secondary">
                      {c.home.viewAppointment}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">{t.dashboard.noUpcoming}</p>
            )}
          </section>

          <section aria-labelledby="messages-heading" className="grid gap-3">
            <SectionHeading>
              <span id="messages-heading">{t.nav.messages}</span>
            </SectionHeading>
            {home.unreadMessages > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{fill(c.home.unreadMessages, { count: home.unreadMessages })}</p>
                <ButtonLink href="/student/messages" variant="secondary">
                  {c.home.openMessages}
                </ButtonLink>
              </div>
            ) : (
              <p className="text-ink-3">{c.home.noUnread}</p>
            )}
          </section>

          <section aria-labelledby="updates-heading" className="grid gap-3">
            <SectionHeading>
              <span id="updates-heading">{t.dashboard.updates}</span>
            </SectionHeading>
            {home.notifications.length > 0 ? (
              <ul className="grid divide-y divide-line rounded-panel border border-line bg-surface">
                {home.notifications.map((n) => {
                  const href = internalLink(n.link);
                  const text = notificationText(n.template, locale);
                  return (
                    <li key={n.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        {n.readAt === null ? <StatusPill tone="accent">{c.home.newUpdate}</StatusPill> : null}
                        {href ? (
                          <Link href={href} className={linkClass}>
                            {text}
                          </Link>
                        ) : (
                          <span>{text}</span>
                        )}
                      </span>
                      <time dateTime={n.createdAt.toISOString()} className="text-ink-3">
                        {fmtDay(n.createdAt, locale)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={t.dashboard.noUpdates} />
            )}
          </section>
        </div>

        <aside aria-label={t.dashboard.supportTitle} className="grid gap-6 md:sticky md:top-24">
          <Panel title={t.dashboard.supportTitle}>
            <div className="grid gap-4">
              <p className="text-sm text-ink-2">{fill(t.dashboard.teamHours, { hours: settings.careTeamHours })}</p>
              {settings.campusContacts.length > 0 ? (
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">{c.home.campusContacts}</h3>
                  <ContactLinks contacts={settings.campusContacts} callAria={c.common.callAria} hoursLabel={c.common.hoursLabel} />
                </div>
              ) : null}
              <p className="text-sm text-ink-2">{t.dashboard.crisisLine}</p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/student/help" variant="secondary">
                  {c.home.askForSupport}
                </ButtonLink>
                <ButtonLink href="/help-now" variant="secondary">
                  {t.common.getHelpNow}
                </ButtonLink>
              </div>
            </div>
          </Panel>
          <Link href="/student/history" className={linkClass}>
            {t.dashboard.viewHistory}
          </Link>
        </aside>
      </div>
    </div>
  );
}
