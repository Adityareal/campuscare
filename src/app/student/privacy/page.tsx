import { consentScopes } from "@/components/student/consent-scopes";
import { ConsentForm } from "@/components/student/consent-form";
import { PageHeader, Panel, StatusPill } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { getInstitutionSettings } from "@/lib/services/config";
import { CURRENT_POLICY_VERSION, getConsentState } from "@/lib/services/consent";
import { savePrivacyAction } from "./actions";

export default async function PrivacyPage() {
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);
  const [settings, consent] = await Promise.all([getInstitutionSettings(db, tenantOf(actor)), getConsentState(db, actor.userId)]);
  const scopes = consentScopes(t, settings.minCohortSize);

  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <PageHeader title={t.privacy.title} description={t.privacy.intro} />

      <section aria-labelledby="current-choices" className="grid gap-3">
        <h2 id="current-choices" className="text-lg font-semibold tracking-tight">
          {c.privacy.currentState}
        </h2>
        <ul className="grid divide-y divide-line rounded-panel border border-line bg-surface">
          {scopes.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>{s.title}</span>
              <StatusPill tone={consent[s.key] ? "accent" : "neutral"}>{consent[s.key] ? t.common.on : t.common.off}</StatusPill>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-3">
          {fill(t.privacy.policyVersion, { version: consent.policyVersion ?? CURRENT_POLICY_VERSION })}
          {consent.lastChangedAt ? `. ${fill(c.privacy.lastChanged, { date: fmtDay(consent.lastChangedAt, actor.locale) })}` : ""}
        </p>
      </section>

      <section aria-labelledby="change-choices" className="grid gap-3">
        <h2 id="change-choices" className="text-lg font-semibold tracking-tight">
          {t.privacy.save}
        </h2>
        <ConsentForm
          action={savePrivacyAction}
          initial={{
            CORE_PROCESSING: consent.CORE_PROCESSING,
            CARE_TEAM_REVIEW: consent.CARE_TEAM_REVIEW,
            AGGREGATE_ANALYTICS: consent.AGGREGATE_ANALYTICS,
          }}
          scopes={scopes}
          submitLabel={t.privacy.save}
          pendingLabel={c.common.saving}
          coreRequiredText={t.privacy.coreRequired}
          dependsOnCoreText={c.privacy.dependsOnCore}
        />
      </section>

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
        <p>{t.privacy.safetyNote}</p>
      </div>
    </div>
  );
}
