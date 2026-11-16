import { RulesForm } from "@/components/telehealth/rules-form";
import { Notice, PageHeader } from "@/components/ui";
import { requireClinician } from "@/lib/auth/guards";
import { fmtDateTime } from "@/lib/format";
import { getRules } from "@/lib/services/rules-admin";
import { updateRulesAction } from "@/app/clinician/rules/actions";

export const metadata = { title: "Triage rules" };

export default async function RulesPage() {
  const actor = await requireClinician();
  const view = await getRules(actor);

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title="Triage rules"
        description="These written rules decide when a student's check-ins, questionnaires and help requests are flagged for human review. No AI model is involved, and a person always reviews a flag."
      />

      <p className="text-sm text-ink-2">
        Current version {view.version}. Last changed {fmtDateTime(view.updatedAt)}
        {view.updatedByName ? ` by ${view.updatedByName}` : ""}.
      </p>

      <Notice tone="info" title="Before you change anything">
        Changes apply to new evaluations only. Alerts that already exist are not re-scored. The default values are starting points and need sign-off from your clinical lead before a pilot.
      </Notice>

      <RulesForm rules={view.rules} version={view.version} action={updateRulesAction} />
    </div>
  );
}
