import { consentScopes } from "@/components/student/consent-scopes";
import { ConsentForm } from "@/components/student/consent-form";
import { ButtonLink, Notice, PageHeader, Panel } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { getInstitutionSettings } from "@/lib/services/config";
import { CURRENT_POLICY_VERSION, getConsentState } from "@/lib/services/consent";
import { saveOnboardingAction } from "./actions";

export default async function OnboardingPage() {
  const actor = await requireStudent({ allowConsentReview: true });
  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);
  const [settings, consent] = await Promise.all([getInstitutionSettings(db, tenantOf(actor)), getConsentState(db, actor.userId)]);

  // Someone coming back after a policy update starts from their earlier answers; a new
  // student starts with only the required choice on.
  const hasHistory = consent.policyVersion !== null;
  const initial = {
    CORE_PROCESSING: hasHistory ? consent.CORE_PROCESSING : true,
    CARE_TEAM_REVIEW: hasHistory ? consent.CARE_TEAM_REVIEW : false,
    AGGREGATE_ANALYTICS: hasHistory ? consent.AGGREGATE_ANALYTICS : false,
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <PageHeader title={t.privacy.onboardingTitle} description={t.privacy.intro} />

      <p className="-mt-4 text-sm text-ink-3">{fill(t.privacy.policyVersion, { version: CURRENT_POLICY_VERSION })}</p>

      <ConsentForm
        action={saveOnboardingAction}
        initial={initial}
        scopes={consentScopes(t, settings.minCohortSize)}
        submitLabel={t.privacy.continue}
        pendingLabel={c.common.saving}
        coreRequiredText={t.privacy.coreRequired}
        dependsOnCoreText={c.privacy.dependsOnCore}
      />

      <Panel title={t.privacy.whoTitle}>
        <ul className="grid gap-2 text-sm text-ink-2">
          {t.privacy.who.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-3 text-sm text-ink-2">
        <p>{t.privacy.aiNote}</p>
        <p>{t.privacy.retention}</p>
        <p>{t.privacy.withdrawNote}</p>
      </div>

      <Notice
        tone="info"
        title={t.urgent.title}
        action={
          <ButtonLink href="/help-now" variant="secondary" size="sm">
            {t.common.getHelpNow}
          </ButtonLink>
        }
      >
        {t.privacy.safetyNote}
      </Notice>
    </div>
  );
}
