import Link from "next/link";
import { EmptyState, PageHeader, SectionHeading, StatusPill, Table, Td, Th, linkClass } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { fmtDay } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { getStudentCopy } from "@/lib/i18n/student";
import { instrumentFor, maxScore } from "@/lib/instruments";
import { listOwnAssessments } from "@/lib/services/assessments";
import { listOwnCheckIns } from "@/lib/services/checkins";

export default async function HistoryPage() {
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const c = getStudentCopy(actor.locale);
  const locale = actor.locale;
  const [checkIns, assessments] = await Promise.all([listOwnCheckIns(actor), listOwnAssessments(actor)]);
  const rating = (v: number | null) => (v === null ? "-" : String(v));

  return (
    <div className="grid gap-10">
      <PageHeader title={t.history.title} back={{ href: "/student", label: t.common.back }} />

      <section aria-labelledby="checkins-heading" className="grid gap-3">
        <SectionHeading>
          <span id="checkins-heading">{t.history.checkIns}</span>
        </SectionHeading>
        {checkIns.length > 0 ? (
          <Table caption={c.history.checkInsCaption}>
            <thead>
              <tr>
                <Th>{c.history.date}</Th>
                <Th>{t.history.mood}</Th>
                <Th>{t.history.stress}</Th>
                <Th>{t.history.sleep}</Th>
                <Th>{c.history.note}</Th>
              </tr>
            </thead>
            <tbody>
              {checkIns.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <time dateTime={r.createdAt.toISOString()}>{fmtDay(r.createdAt, locale)}</time>
                  </Td>
                  <Td className="font-mono tabular-nums">{rating(r.mood)}</Td>
                  <Td className="font-mono tabular-nums">{rating(r.stress)}</Td>
                  <Td className="font-mono tabular-nums">{rating(r.sleep)}</Td>
                  <Td className="min-w-48 whitespace-pre-wrap">{r.note ?? c.history.noNote}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={t.history.none} />
        )}
      </section>

      <section aria-labelledby="assessments-heading" className="grid gap-3">
        <SectionHeading>
          <span id="assessments-heading">{t.history.questionnaires}</span>
        </SectionHeading>
        {assessments.length > 0 ? (
          <Table caption={c.history.assessmentsCaption}>
            <thead>
              <tr>
                <Th>{c.history.date}</Th>
                <Th>{c.history.questionnaire}</Th>
                <Th>{c.history.score}</Th>
                <Th>{c.history.range}</Th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => {
                const def = instrumentFor(a.instrument);
                const when = a.completedAt ?? a.assignedAt;
                return (
                  <tr key={a.id}>
                    <Td>
                      <time dateTime={when.toISOString()}>{fmtDay(when, locale)}</time>
                    </Td>
                    <Td>{def.name}</Td>
                    {a.score ? (
                      <>
                        <Td className="font-mono tabular-nums">{fill(c.history.scoreOf, { total: a.score.total, max: maxScore(def) })}</Td>
                        <Td>{(t.assessment.bands as Record<string, string>)[a.score.band] ?? a.score.band}</Td>
                      </>
                    ) : (
                      <Td className="text-ink-3">
                        {a.status === "ASSIGNED" ? (
                          <span className="flex flex-wrap items-center gap-3">
                            <StatusPill>{c.history.pending}</StatusPill>
                            <Link href={`/student/assessments/${a.id}`} className={linkClass}>
                              {c.history.openIt}
                            </Link>
                          </span>
                        ) : (
                          <StatusPill>{c.history.cancelled}</StatusPill>
                        )}
                      </Td>
                    )}
                    {a.score ? null : <Td>{"-"}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={t.history.none} />
        )}
      </section>
    </div>
  );
}
