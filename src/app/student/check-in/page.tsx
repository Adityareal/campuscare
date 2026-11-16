import { CheckInForm } from "@/components/student/check-in-form";
import { PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";

export default async function CheckInPage() {
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);
  const ci = t.checkIn;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={ci.title} description={ci.intro} back={{ href: "/student", label: t.common.back }} />
      <CheckInForm
        labels={{
          scales: [
            { field: "mood", legend: ci.mood, options: [...ci.scales.mood] },
            { field: "stress", legend: ci.stress, options: [...ci.scales.stress] },
            { field: "sleep", legend: ci.sleep, options: [...ci.scales.sleep] },
            { field: "energy", legend: ci.energy, options: [...ci.scales.energy] },
            { field: "social", legend: ci.social, options: [...ci.scales.social] },
            { field: "academicPressure", legend: ci.academicPressure, options: [...ci.scales.academicPressure] },
          ],
          skip: t.common.skip,
          talkLegend: ci.wantsToTalk,
          talkOptions: [
            { value: "NO", label: ci.talk.NO },
            { value: "NOT_NOW", label: ci.talk.NOT_NOW },
            { value: "YES", label: ci.talk.YES },
          ],
          noteLabel: ci.noteLabel,
          noteHelp: ci.noteHelp,
          optional: t.common.optional,
          submit: ci.submit,
          pending: c.common.saving,
          reviewPrivacy: c.common.reviewPrivacy,
        }}
      />
    </div>
  );
}
