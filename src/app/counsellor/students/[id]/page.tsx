import Link from "next/link";
import { notFound } from "next/navigation";
import { ALERT_STATUS_LABEL, CASE_STATUS_LABEL, DEPARTMENT_NONE } from "@/components/care/labels";
import { TrendChart } from "@/components/charts";
import { KeyValueList, Notice, PageHeader, Panel, Ref, Table, Td, Th, TriageBadge, When, linkClass } from "@/components/ui";
import { requireCareTeam } from "@/lib/auth/guards";
import { isDomainError } from "@/lib/errors";
import { BAND_LABEL, instrumentFor, maxScore, type SeverityBand } from "@/lib/instruments";
import { getStudentCareProfile } from "@/lib/services/care-dashboard";
import { HELP_TYPE_LABEL } from "@/lib/services/help";

type Profile = Awaited<ReturnType<typeof getStudentCareProfile>>;

function bandLabel(band: string): string {
  return (BAND_LABEL as Record<string, string>)[band as SeverityBand] ?? band;
}

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCareTeam();
  const { id } = await params;
  let p: Profile;
  try {
    p = await getStudentCareProfile(actor, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const s = p.student;
  const profile = s.student;
  const series = [
    { label: "Mood", points: p.checkIns.map((c) => ({ at: c.createdAt, value: c.mood })) },
    { label: "Stress", points: p.checkIns.map((c) => ({ at: c.createdAt, value: c.stress })) },
    { label: "Sleep", points: p.checkIns.map((c) => ({ at: c.createdAt, value: c.sleep })) },
  ];

  return (
    <>
      <PageHeader back={{ href: "/counsellor/cases", label: "Cases" }} title={s.name} description="Student record for the care team. Every view is logged." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
          {p.maySeeTrends ? (
            <>
              <Panel title="Check-in trends" description="Last 120 days, each rated 1 to 5.">
                <TrendChart series={series} yMin={1} yMax={5} ticks={[1, 3, 5]} label={`Mood, stress and sleep check-ins for ${s.name}`} />
              </Panel>
              <Panel title="Questionnaires" description="A score in a range on a screening questionnaire is not a diagnosis.">
                {p.assessments.length === 0 ? (
                  <p className="text-sm text-ink-3">No completed questionnaires.</p>
                ) : (
                  <Table caption={`Completed questionnaires for ${s.name}`}>
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Questionnaire</Th>
                        <Th>Score</Th>
                        <Th>Range</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.assessments.map((a) => {
                        const def = instrumentFor(a.instrument);
                        return (
                          <tr key={a.id}>
                            <Td>{a.completedAt ? <When date={a.completedAt} /> : "-"}</Td>
                            <Td>{def.name}</Td>
                            <Td className="font-mono tabular-nums">{a.score ? `${a.score.total} of ${maxScore(def)}` : "-"}</Td>
                            <Td>
                              {a.score ? bandLabel(a.score.band) : "-"}
                              {a.score?.safetyItemPositive ? <span className="ml-2 font-medium text-urgent-text">Safety item answered</span> : null}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </Panel>
            </>
          ) : (
            <Notice title="Trends are not shared">
              This student has not allowed the care team to see their check-ins and questionnaires. Their requests for help, alerts and cases are still shown below.
            </Notice>
          )}

          <Panel title="Alerts">
            {p.alerts.length === 0 ? (
              <p className="text-sm text-ink-3">No alerts. This does not mean the student is safe.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.alerts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <TriageBadge category={a.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/counsellor/alerts/${a.id}`} className={linkClass}>
                        {a.title}
                      </Link>
                      <p className="text-sm text-ink-3">
                        <Ref>{a.reference}</Ref> {ALERT_STATUS_LABEL[a.status]}, raised <When date={a.createdAt} />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Cases">
            {p.cases.length === 0 ? (
              <p className="text-sm text-ink-3">No cases.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.cases.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <TriageBadge category={c.priority} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/counsellor/cases/${c.id}`} className={linkClass}>
                        Case <Ref>{c.reference}</Ref>
                      </Link>
                      <p className="text-sm text-ink-3">
                        {CASE_STATUS_LABEL[c.status]}, opened <When date={c.openedAt} />
                        {c.closedAt ? (
                          <>
                            , closed <When date={c.closedAt} />
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Help requests">
            {p.helpRequests.length === 0 ? (
              <p className="text-sm text-ink-3">No help requests.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.helpRequests.map((h) => (
                  <li key={h.id} className="py-3 text-sm first:pt-0 last:pb-0">
                    <span className="font-medium">{HELP_TYPE_LABEL[h.type]}</span>
                    <span className="text-ink-3">
                      {" "}
                      <When date={h.createdAt} />
                    </span>
                    {h.caseId ? (
                      <>
                        {" "}
                        <Link href={`/counsellor/cases/${h.caseId}`} className={linkClass}>
                          Open the case
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="grid content-start gap-6">
          <Panel title="Profile">
            <KeyValueList
              items={[
                { label: "Department", value: profile ? profile.department.name : DEPARTMENT_NONE },
                { label: "Year", value: profile ? String(profile.academicYear) : "-" },
                { label: "Student number", value: profile?.studentNumber ?? "-" },
                { label: "Phone", value: profile?.contactPhone ?? "Not recorded" },
                { label: "Email", value: s.email },
                { label: "Language", value: s.locale === "hi" ? "Hindi" : "English" },
              ]}
            />
          </Panel>
          <Panel title="Consent">
            <KeyValueList
              items={[
                { label: "Use CampusCare", value: p.consent.CORE_PROCESSING ? "Granted" : "Not granted" },
                { label: "Care team review of trends", value: p.consent.CARE_TEAM_REVIEW ? "Granted" : "Not granted" },
                { label: "Anonymous statistics", value: p.consent.AGGREGATE_ANALYTICS ? "Granted" : "Not granted" },
                { label: "Policy version", value: p.consent.policyVersion ?? "Not reviewed" },
                { label: "Last changed", value: p.consent.lastChangedAt ? <When date={p.consent.lastChangedAt} /> : "-" },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
