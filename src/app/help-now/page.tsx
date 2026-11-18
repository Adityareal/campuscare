import type { Metadata } from "next";
import Link from "next/link";
import { StudentShell } from "@/components/shell/student-shell";
import { ContactLinks } from "@/components/student/contacts";
import { UrgentRequest } from "@/components/student/urgent-request";
import { ButtonLink, Notice, PageHeader, Panel } from "@/components/ui";
import type { Locale } from "@prisma/client";
import { getCurrentActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { NATIONAL_CRISIS_CONTACTS, getInstitutionSettings } from "@/lib/services/config";

export const metadata: Metadata = { title: "Get help now", robots: { index: false, follow: false } };

/**
 * Public on purpose: it must work without signing in, in either language. A signed-in student
 * sees it inside their usual frame and can also ask the campus team to make contact.
 */
export default async function HelpNowPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const actor = await getCurrentActor();
  const student = actor && actor.role === "STUDENT" ? actor : null;

  const { lang } = await searchParams;
  const requested = Array.isArray(lang) ? lang[0] : lang;
  const locale: Locale = student ? student.locale : requested === "hi" ? "hi" : "en";
  const t = getDictionary(locale);
  const c = getStudentCopy(locale);

  const settings = student?.institutionId ? await getInstitutionSettings(db, student.institutionId) : null;

  const content = (
    <div className="mx-auto grid max-w-2xl gap-8">
      <PageHeader title={t.urgent.title} />

      <Notice tone="danger" role="status">
        <p className="text-base font-semibold">{t.urgent.danger}</p>
      </Notice>

      <section aria-labelledby="national-heading" className="grid gap-3">
        <h2 id="national-heading" className="text-lg font-semibold tracking-tight">
          {c.helpNow.national}
        </h2>
        <ContactLinks contacts={NATIONAL_CRISIS_CONTACTS} callAria={c.common.callAria} hoursLabel={c.common.hoursLabel} large />
        <p className="text-sm text-ink-2">{t.urgent.teleManas}</p>
      </section>

      {student && settings ? (
        <section aria-labelledby="campus-heading" className="grid gap-4">
          <h2 id="campus-heading" className="text-lg font-semibold tracking-tight">
            {t.urgent.campusTeam}
          </h2>
          <p className="text-sm text-ink-2">{fill(t.dashboard.teamHours, { hours: settings.careTeamHours })}</p>
          {settings.campusContacts.length > 0 ? (
            <ContactLinks contacts={settings.campusContacts} callAria={c.common.callAria} hoursLabel={c.common.hoursLabel} />
          ) : null}
          <Panel>
            <UrgentRequest label={t.urgent.requestUrgent} pending={c.helpNow.sending} />
          </Panel>
        </section>
      ) : null}

      {!actor ? (
        <section className="grid gap-3">
          <p className="text-ink-2">{c.helpNow.signInPrompt}</p>
          <div>
            <ButtonLink href="/sign-in" variant="secondary">
              {c.helpNow.signIn}
            </ButtonLink>
          </div>
        </section>
      ) : null}

      <p className="text-sm text-ink-3">{t.urgent.notEmergency}</p>
    </div>
  );

  if (student) return <StudentShell actor={student}>{content}</StudentShell>;

  const other: Locale = locale === "en" ? "hi" : "en";
  return (
    <div lang={locale} className="flex-1">
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
            CampusCare
          </Link>
          <Link href={`/help-now?lang=${other}`} lang={other} className="rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            {t.meta.switchTo}
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        {content}
      </main>
    </div>
  );
}
