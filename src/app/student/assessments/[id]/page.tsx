import { notFound } from "next/navigation";
import { AssessmentForm } from "@/components/student/assessment-form";
import { SafetyPanel } from "@/components/student/safety-panel";
import { ButtonLink, Notice, PageHeader, Panel } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { isDomainError } from "@/lib/errors";
import { fmtDay } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { instrumentFor, maxScore } from "@/lib/instruments";
import { getOwnAssessment } from "@/lib/services/assessments";
import { getInstitutionSettings } from "@/lib/services/config";
import { getConsentState } from "@/lib/services/consent";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStudent();
  const { id } = await params;
  const assessment = await getOwnAssessment(actor, id).catch((error: unknown) => {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);
  const def = instrumentFor(assessment.instrument);
  const translated = def.validatedLocales.includes(actor.locale);
  const itemsLang = translated ? actor.locale : "en";
  const [settings, consent] = await Promise.all([getInstitutionSettings(db, tenantOf(actor)), getConsentState(db, actor.userId)]);

  const attribution = (
    <p className="text-xs text-ink-3">
      <span className="font-medium">{c.assessment.aboutTitle}:</span> <span lang="en">{def.version}. {def.attribution}</span>
    </p>
  );

  if (assessment.status === "ASSIGNED") {
    return (
      <div className="mx-auto grid max-w-2xl gap-6">
        <PageHeader title={def.name} description={t.assessment.intro} back={{ href: "/student", label: t.common.back }} />
        {!translated ? <Notice tone="info">{t.assessment.translationPending}</Notice> : null}
        <AssessmentForm
          assessmentId={assessment.id}
          itemsLang={itemsLang}
          stem={def.stem}
          items={[...def.items]}
          options={def.options.map((o) => ({ value: o.value, label: o.label }))}
          difficultyHeading={t.assessment.difficulty}
          difficultyQuestion={def.difficultyQuestion}
          difficultyOptions={[...def.difficultyOptions]}
          optional={t.common.optional}
          itemOf={c.assessment.itemOf}
          submit={t.assessment.submit}
          pending={c.assessment.submitting}
          answerAll={c.assessment.answerAll}
        />
        {attribution}
      </div>
    );
  }

  if (assessment.status === "CANCELLED" || !assessment.score) {
    return (
      <div className="mx-auto grid max-w-2xl gap-6">
        <PageHeader title={def.name} back={{ href: "/student", label: t.common.back }} />
        <Notice tone="info">{c.assessment.cancelled}</Notice>
        <div>
          <ButtonLink href="/student" variant="secondary">
            {t.assessment.done}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const score = assessment.score;
  const bandLabel = (t.assessment.bands as Record<string, string>)[score.band] ?? score.band;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title={def.name}
        description={assessment.completedAt ? fill(c.assessment.completedOn, { date: fmtDay(assessment.completedAt, actor.locale) }) : undefined}
        back={{ href: "/student", label: t.common.back }}
      />

      {score.safetyItemPositive ? (
        <SafetyPanel
          t={t}
          c={c}
          campusContacts={settings.campusContacts}
          careTeamHours={settings.careTeamHours}
          careTeamReview={consent.CARE_TEAM_REVIEW}
        />
      ) : null}

      <Panel title={t.assessment.resultTitle}>
        <p className="text-lg">{fill(t.assessment.resultBody, { total: score.total, max: maxScore(def), band: bandLabel })}</p>
        <p className="mt-3 text-sm text-ink-2">{t.assessment.resultNote}</p>
      </Panel>

      <div>
        <ButtonLink href="/student" variant="secondary">
          {t.assessment.done}
        </ButtonLink>
      </div>
      {attribution}
    </div>
  );
}
