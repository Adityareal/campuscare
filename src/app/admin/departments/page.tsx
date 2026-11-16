import type { Metadata } from "next";
import { BarList } from "@/components/charts";
import { FigureText, LinkTabs, PeriodTabs, SuppressionNote } from "@/components/admin/figure";
import { orNotFound } from "@/components/admin/not-found";
import { EmptyState, Notice, PageHeader, Panel, Table, Td, Th, cx, tableCell } from "@/components/ui";
import { requireInstitutionAdmin } from "@/lib/auth/guards";
import {
  PERIOD_LABELS,
  fmtMean,
  fmtRate,
  getGroupBreakdown,
  hiddenText,
  parsePeriodKey,
  periodFor,
  type GroupDimension,
} from "@/lib/services/analytics";

export const metadata: Metadata = { title: "Departments and years" };

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireInstitutionAdmin();
  const sp = await searchParams;
  const periodKey = parsePeriodKey(sp.period);
  const dimension: GroupDimension = sp.by === "year" ? "year" : "department";
  const g = await orNotFound(getGroupBreakdown(actor, { ...periodFor(periodKey), dimension }));
  const k = g.k;
  const noun = dimension === "department" ? "department" : "year of study";

  return (
    <>
      <PageHeader
        title="Departments and years"
        description="Participation and self-reported well-being by group. Alerts and cases are never broken down by group."
        actions={<PeriodTabs current={periodKey} basePath="/admin/departments" extra={{ by: dimension }} />}
      />

      <div className="grid gap-6">
        <LinkTabs
          label="Group by"
          items={[
            { href: `/admin/departments?by=department&period=${periodKey}`, label: "By department", active: dimension === "department" },
            { href: `/admin/departments?by=year&period=${periodKey}`, label: "By year of study", active: dimension === "year" },
          ]}
        />

        {g.rows.length === 0 ? (
          <EmptyState title={`No ${noun} groups yet`}>
            {dimension === "department" ? "Add departments in Settings so students can choose one when they register." : "No students are enrolled yet."}
          </EmptyState>
        ) : (
          <>
            {g.hiddenGroups > 0 ? (
              <Notice tone="info" title={`${g.hiddenGroups} ${g.hiddenGroups === 1 ? "group is" : "groups are"} hidden`}>
                Small groups are hidden so that no student can be identified from a group figure. Merge small departments or widen
                the period to see more.
              </Notice>
            ) : null}

            <Panel title="Check-in participation" description={`Share of enrolled students in each ${noun} who checked in, ${PERIOD_LABELS[periodKey].toLowerCase()}.`}>
              <BarList
                items={g.rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.participationRate.value,
                  note: r.participationRate.value === null && r.hidden ? hiddenText(r.hidden, k) : undefined,
                }))}
                max={1}
                format={fmtRate}
                suppressedText="Not shown"
              />
            </Panel>

            <Panel title="Group figures" description="Mood and stress include only students who allow aggregate analytics.">
              <Table caption={`Enrolment, participation, mean mood and mean stress by ${noun}`}>
                <thead>
                  <tr>
                    <Th>{dimension === "department" ? "Department" : "Year"}</Th>
                    <Th>Enrolled</Th>
                    <Th>Participation</Th>
                    <Th>Mean mood (1 to 5)</Th>
                    <Th>Mean stress (1 to 5)</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.key}>
                      <Td className="font-medium">{r.label}</Td>
                      {r.hidden === "small_group" || r.hidden === "complementary" ? (
                        <td className={cx(tableCell, "text-ink-3")} colSpan={4}>
                          {hiddenText(r.hidden, k)}
                        </td>
                      ) : (
                        <>
                          <Td className="font-mono tabular-nums">
                            <FigureText figure={r.enrolled} k={k} />
                          </Td>
                          <Td className="font-mono tabular-nums">
                            <FigureText figure={r.participationRate} k={k} format={fmtRate} />
                          </Td>
                          <Td className="font-mono tabular-nums">
                            <FigureText figure={r.meanMood} k={k} format={fmtMean} />
                          </Td>
                          <Td className="font-mono tabular-nums">
                            <FigureText figure={r.meanStress} k={k} format={fmtMean} />
                          </Td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr>
                    <Td className="font-medium">Total</Td>
                    <Td className="font-mono tabular-nums">
                      <FigureText figure={g.total.enrolled} k={k} />
                    </Td>
                    <Td className="font-mono tabular-nums">
                      <FigureText figure={g.total.participationRate} k={k} format={fmtRate} />
                    </Td>
                    <Td />
                    <Td />
                  </tr>
                </tbody>
              </Table>
            </Panel>
          </>
        )}

        <SuppressionNote k={k}>The minimum group size is set in Settings and can never be lower than 5.</SuppressionNote>
      </div>
    </>
  );
}
