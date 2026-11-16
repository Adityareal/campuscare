import { ContactLinks } from "@/components/student/contacts";
import { SafetyAskForm } from "@/components/student/safety-ask-form";
import { Notice } from "@/components/ui";
import { fill, type Dictionary } from "@/lib/i18n";
import type { StudentCopy } from "@/lib/i18n/student";
import { NATIONAL_CRISIS_CONTACTS, type CrisisContact } from "@/lib/services/config";

/** Shown before any score when the questionnaire's safety item was answered above zero. It
 * leads with ways to reach a person now and never frames the answer as a diagnosis. */
export function SafetyPanel({
  t,
  c,
  campusContacts,
  careTeamHours,
  careTeamReview,
}: {
  t: Dictionary;
  c: StudentCopy;
  campusContacts: CrisisContact[];
  careTeamHours: string;
  careTeamReview: boolean;
}) {
  return (
    <section aria-labelledby="safety-title" className="grid gap-4 rounded-panel border border-urgent bg-urgent-soft px-5 py-5 text-urgent-text">
      <div>
        <h2 id="safety-title" className="text-lg font-semibold">
          {t.assessment.safetyTitle}
        </h2>
        <p className="mt-1">{t.assessment.safetyBody}</p>
        <p className="mt-2 font-medium">{t.urgent.danger}</p>
      </div>

      <div className="text-ink">
        <ContactLinks contacts={NATIONAL_CRISIS_CONTACTS} callAria={c.common.callAria} hoursLabel={c.common.hoursLabel} />
      </div>

      {campusContacts.length > 0 ? (
        <div className="grid gap-2 text-ink">
          <h3 className="text-sm font-semibold text-urgent-text">{t.urgent.campusTeam}</h3>
          <ContactLinks contacts={campusContacts} callAria={c.common.callAria} hoursLabel={c.common.hoursLabel} />
        </div>
      ) : null}

      <div className="text-ink">
        <SafetyAskForm label={t.assessment.safetyAsk} pending={c.common.sending} />
      </div>

      {careTeamReview ? <Notice tone="info">{fill(t.assessment.safetyShared, { hours: careTeamHours })}</Notice> : null}
    </section>
  );
}
