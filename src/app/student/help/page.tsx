import { HelpForm } from "@/components/student/help-form";
import { PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { HELP_TYPES } from "@/lib/services/help";

export default async function HelpPage() {
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.help.title} description={t.help.intro} back={{ href: "/student", label: t.common.back }} />
      <HelpForm
        labels={{
          legend: c.help.typeLegend,
          types: HELP_TYPES.map((value) => ({ value, label: t.help.types[value] })),
          detailsLabel: t.help.detailsLabel,
          optional: t.common.optional,
          submit: t.help.submit,
          pending: c.common.sending,
          urgentLink: t.help.urgentLink,
        }}
      />
    </div>
  );
}
