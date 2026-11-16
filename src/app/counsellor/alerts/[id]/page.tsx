import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/care/action-form";
import { EscalationAttemptForm } from "@/components/care/escalation-attempt-form";
import { ALERT_STATUS_LABEL, CASE_STATUS_LABEL, DEPARTMENT_NONE, ROLE_LABEL } from "@/components/care/labels";
import {
  Field,
  Fieldset,
  KeyValueList,
  Notice,
  PageHeader,
  Panel,
  Ref,
  Select,
  StatusPill,
  Table,
  Td,
  Textarea,
  Th,
  TriageBadge,
  When,
  linkClass,
} from "@/components/ui";
import { requireCareTeam } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { isDomainError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import {
  CHANNEL_LABEL,
  DECISION_LABEL,
  ESCALATION_CHANNELS,
  ESCALATION_OUTCOMES,
  ESCALATION_TARGETS,
  FEEDBACK_LABEL,
  getAlertDetail,
  listCareTeam,
  OUTCOME_LABEL,
  TARGET_LABEL,
} from "@/lib/services/alerts";
import { getInstitutionSettings, NATIONAL_CRISIS_CONTACTS } from "@/lib/services/config";
import { tenantOf } from "@/lib/auth/permissions";
import {
  acknowledgeAlertAction,
  assignAlertAction,
  closeAlertAction,
  escalateAlertAction,
  openCaseFromAlertAction,
  recategorizeAlertAction,
  recordEscalationAttemptAction,
  requestAssessmentAction,
  reviewAlertAction,
} from "./actions";

type Detail = Awaited<ReturnType<typeof getAlertDetail>>;

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Alert raised",
  EVIDENCE_ADDED: "Evidence added",
  ACKNOWLEDGED: "Acknowledged",
  ASSIGNED: "Assigned",
  REVIEWED: "Reviewed",
  CATEGORY_RAISED: "Category raised",
  CATEGORY_CHANGED: "Category changed",
  NOTE: "Note",
  CLOSED: "Closed",
  CASE_LINKED: "Linked to a case",
  ASSESSMENT_REQUESTED: "Questionnaire requested",
  ESCALATED: "Crisis protocol notifications sent",
  ESCALATION_STARTED: "Crisis protocol notifications sent",
  RE_ESCALATED: "Re-notified",
};

function label<T extends string>(map: Record<T, string>, key: string): string {
  return (map as Record<string, string>)[key] ?? key;
}

type TimelineEntry = { key: string; at: Date; title: string; by: string; lines: string[] };

function buildTimeline(a: Detail): TimelineEntry[] {
  const name = (id: string | null) => (id ? (a.staffById.get(id)?.name ?? "A staff member") : "System");
  const events: TimelineEntry[] = a.events
    // Attempts are shown from their own records below, with full detail.
    .filter((e) => e.type !== "ESCALATION_ATTEMPT")
    .map((e) => ({
      key: `e-${e.id}`,
      at: e.createdAt,
      title: EVENT_LABEL[e.type] ?? e.type.replace(/_/g, " ").toLowerCase(),
      by: name(e.actorId),
      lines: [
        ...(e.fromCategory && e.toCategory ? [`From ${e.fromCategory.toLowerCase()} to ${e.toCategory.toLowerCase()}`] : []),
        ...(e.note ? [e.note] : []),
        ...(e.detail ? [e.detail] : []),
      ],
    }));
  const attempts: TimelineEntry[] = a.escalations.map((x) => {
    const target = x.targetLabel ?? (x.targetUserId ? name(x.targetUserId) : "Unknown");
    return {
      key: `x-${x.id}`,
      at: x.attemptedAt,
      title: `Contact attempt: ${target}`,
      by: x.recordedById ? name(x.recordedById) : "System",
      lines: [
        `${label(CHANNEL_LABEL, x.channel)}. ${label(OUTCOME_LABEL, x.outcome)}.`,
        ...(x.acknowledgedAt ? [`Acknowledged ${fmtDateTime(x.acknowledgedAt)}`] : []),
        ...(x.detail ? [x.detail] : []),
      ],
    };
  });
  return [...events, ...attempts].sort((p, q) => p.at.getTime() - q.at.getTime());
}

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCareTeam();
  const { id } = await params;
  let a: Detail;
  try {
    a = await getAlertDetail(actor, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [team, settings] = await Promise.all([listCareTeam(actor), getInstitutionSettings(db, tenantOf(actor))]);
  const onCall = settings.onCallResponderId ? team.find((m) => m.id === settings.onCallResponderId) : undefined;
  const closed = a.status === "CLOSED";
  const urgent = a.category === "URGENT";
  const timeline = buildTimeline(a);
  const profile = a.student.student;
  const decisionKeys = Object.keys(DECISION_LABEL) as (keyof typeof DECISION_LABEL)[];
  const feedbackKeys = Object.keys(FEEDBACK_LABEL) as (keyof typeof FEEDBACK_LABEL)[];
  const linkedCase = a.cases[0]?.case;

  return (
    <>
      <PageHeader
        back={{ href: "/counsellor/alerts", label: "Alerts" }}
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TriageBadge category={a.category} />
            <Ref>{a.reference}</Ref>
            <StatusPill tone={closed ? "neutral" : "accent"}>{ALERT_STATUS_LABEL[a.status]}</StatusPill>
            {a.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : null}
            <span className="text-sm text-ink-3">
              Raised <When date={a.createdAt} />
              {a.status === "NEW" ? <>. Acknowledge by <When date={a.slaDueAt} /></> : null}
            </span>
          </span>
        }
      />

      {urgent && !closed ? (
        <Notice tone="danger" role="alert" title="Follow the crisis protocol" className="mb-6">
          <p>Try to reach the student and the on-call responder now, and record every attempt below, including attempts that did not get through.</p>
          <p className="mt-2">On-call responder: {onCall ? `${onCall.name} (${ROLE_LABEL[onCall.role]})` : "not set in institution settings"}.</p>
          <ul className="mt-2 grid gap-1">
            {[...settings.campusContacts, ...NATIONAL_CRISIS_CONTACTS].map((c) => (
              <li key={`${c.label}-${c.phone}`}>
                {c.label}:{" "}
                <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="font-semibold underline underline-offset-4">
                  {c.phone}
                </a>{" "}
                ({c.hours})
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Notice className="mb-6">Categories are operational labels for how soon to respond, not diagnoses.</Notice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
          <Panel title="Why this alert was raised" description="Each finding names the written rule that fired and the evidence it used.">
            {a.indicators.length === 0 ? (
              <p className="text-sm text-ink-3">No findings are attached to this alert.</p>
            ) : (
              <ul className="divide-y divide-line">
                {a.indicators.map((i) => (
                  <li key={i.id} className="grid gap-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <TriageBadge category={i.category} size="sm" />
                      <p className="font-medium">{i.label}</p>
                      <span className="text-xs text-ink-3">
                        Rule {i.ruleCode}, version {i.ruleVersion}
                      </span>
                    </div>
                    <p className="text-sm text-ink-2">{i.explanation}</p>
                    {i.evidence.length > 0 ? (
                      <Table caption={`Evidence for ${i.label}`}>
                        <thead>
                          <tr>
                            <Th>Date</Th>
                            <Th>Evidence</Th>
                            <Th>Value</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {i.evidence.map((ev, idx) => (
                            <tr key={`${ev.id}-${idx}`}>
                              <Td>
                                <When date={new Date(ev.at)} />
                              </Td>
                              <Td>{ev.label}</Td>
                              <Td className="font-mono tabular-nums">{ev.value === null ? "-" : ev.value}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recommended action">
            <p className="text-sm">{a.recommendedAction}</p>
            {a.decision ? (
              <div className="mt-4 grid gap-1 text-sm">
                <p>
                  <span className="text-ink-3">Review decision: </span>
                  {DECISION_LABEL[a.decision]}
                </p>
                {a.reviewerFeedback ? (
                  <p>
                    <span className="text-ink-3">Reviewer feedback: </span>
                    {FEEDBACK_LABEL[a.reviewerFeedback]}
                  </p>
                ) : null}
                {a.decisionNote ? <p className="whitespace-pre-wrap">{a.decisionNote}</p> : null}
              </div>
            ) : null}
          </Panel>

          {!closed ? (
            <>
              <Panel title="Review" description={urgent ? "A written note is required for urgent alerts." : "Record what you decided and whether the alert was useful."}>
                <ActionForm action={reviewAlertAction} submitLabel="Record review">
                  <input type="hidden" name="alertId" value={a.id} />
                  <Fieldset legend="Decision">
                    {decisionKeys.map((k) => (
                      <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                        <input type="radio" name="decision" value={k} required className="size-4 accent-accent" />
                        {DECISION_LABEL[k]}
                      </label>
                    ))}
                  </Fieldset>
                  <Fieldset legend="Was the alert useful?" hint="Optional. Helps clinicians tune the rules.">
                    {feedbackKeys.map((k) => (
                      <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                        <input type="radio" name="feedback" value={k} className="size-4 accent-accent" />
                        {FEEDBACK_LABEL[k]}
                      </label>
                    ))}
                  </Fieldset>
                  <Field id="review-note" label="Review note" optionalLabel={urgent ? undefined : "Optional"} hint="Stored encrypted. Visible to the care team only.">
                    <Textarea id="review-note" name="note" maxLength={4000} required={urgent} aria-describedby="review-note-hint" />
                  </Field>
                </ActionForm>
              </Panel>

              <Panel title="Contact and escalation attempts" description="Record each attempt to reach the student, the on-call responder or an outside service.">
                <EscalationAttemptForm
                  action={recordEscalationAttemptAction}
                  alertId={a.id}
                  targets={ESCALATION_TARGETS.map((t) => ({ value: t, label: TARGET_LABEL[t] }))}
                  channels={ESCALATION_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
                  outcomes={ESCALATION_OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABEL[o] }))}
                  responders={team.map((m) => ({ value: m.id, label: `${m.name} (${ROLE_LABEL[m.role]})` }))}
                  defaultResponderId={onCall?.id ?? null}
                />
              </Panel>

              <div className="grid gap-6 md:grid-cols-2">
                {!urgent ? (
                  <Panel title="Escalate to urgent" description="Starts the crisis protocol notifications.">
                    <ActionForm action={escalateAlertAction} submitLabel="Escalate" variant="danger">
                      <input type="hidden" name="alertId" value={a.id} />
                      <Field id="escalate-reason" label="Reason" hint="At least a sentence.">
                        <Textarea id="escalate-reason" name="reason" required minLength={10} maxLength={2000} aria-describedby="escalate-reason-hint" />
                      </Field>
                    </ActionForm>
                  </Panel>
                ) : null}
                <Panel title="Change category" description={urgent ? "Lowering an urgent alert needs a recorded review first." : "Raise or lower below urgent."}>
                  <ActionForm action={recategorizeAlertAction} submitLabel="Change category" variant="secondary">
                    <input type="hidden" name="alertId" value={a.id} />
                    <Field id="recat-category" label="New category">
                      <Select id="recat-category" name="category" defaultValue={a.category === "PRIORITY" ? "MONITOR" : "PRIORITY"}>
                        <option value="PRIORITY">Priority</option>
                        <option value="MONITOR">Monitor</option>
                      </Select>
                    </Field>
                    <Field id="recat-reason" label="Reason" hint="At least a sentence.">
                      <Textarea id="recat-reason" name="reason" required minLength={10} maxLength={2000} aria-describedby="recat-reason-hint" />
                    </Field>
                  </ActionForm>
                </Panel>
              </div>
            </>
          ) : null}

          <Panel title="Timeline" description="Events and contact attempts, oldest first.">
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing recorded yet.</p>
            ) : (
              <ol className="grid gap-0">
                {timeline.map((t) => (
                  <li key={t.key} className="grid gap-1 border-l-2 border-line py-3 pl-4">
                    <p className="text-sm">
                      <span className="font-medium">{t.title}</span>
                      <span className="text-ink-3">
                        {" "}
                        by {t.by}, <When date={t.at} />
                      </span>
                    </p>
                    {t.lines.map((line, i) => (
                      <p key={i} className="whitespace-pre-wrap text-sm text-ink-2">
                        {line}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="grid content-start gap-6">
          <Panel title="Student">
            <KeyValueList
              items={[
                {
                  label: "Name",
                  value: (
                    <Link href={`/counsellor/students/${a.student.id}`} className={linkClass}>
                      {a.student.name}
                    </Link>
                  ),
                },
                { label: "Department", value: profile ? `${profile.department.name}, year ${profile.academicYear}` : DEPARTMENT_NONE },
                { label: "Student number", value: profile?.studentNumber ?? "-" },
                { label: "Phone", value: profile?.contactPhone ?? "Not recorded" },
                { label: "Email", value: a.student.email },
                { label: "Language", value: a.student.locale === "hi" ? "Hindi" : "English" },
                {
                  label: "Care team review",
                  value: a.consent.CARE_TEAM_REVIEW ? "Allowed" : "Not allowed: trends are hidden",
                },
              ]}
            />
          </Panel>

          {!closed ? (
            <Panel title="Actions">
              <div className="grid gap-5">
                {a.status === "NEW" ? (
                  <ActionForm action={acknowledgeAlertAction} submitLabel="Acknowledge">
                    <input type="hidden" name="alertId" value={a.id} />
                    <p className="text-sm text-ink-3">
                      {a.overdue ? "This alert is past its response time. " : null}
                      Acknowledging assigns the alert to you if nobody holds it.
                    </p>
                  </ActionForm>
                ) : null}

                <ActionForm action={assignAlertAction} submitLabel="Assign" variant="secondary">
                  <input type="hidden" name="alertId" value={a.id} />
                  <Field id="assign-to" label="Assigned to">
                    <Select id="assign-to" name="assigneeId" defaultValue={a.assignedToId ?? ""} required>
                      <option value="" disabled>
                        Choose a person
                      </option>
                      {team.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({ROLE_LABEL[m.role]})
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ActionForm>

                <ActionForm action={requestAssessmentAction} submitLabel="Send questionnaire" variant="secondary">
                  <input type="hidden" name="alertId" value={a.id} />
                  <input type="hidden" name="studentId" value={a.student.id} />
                  <Field id="assess-instrument" label="Request further assessment">
                    <Select id="assess-instrument" name="instrument" defaultValue="PHQ9">
                      <option value="PHQ9">PHQ-9</option>
                      <option value="GAD7">GAD-7</option>
                    </Select>
                  </Field>
                </ActionForm>

                <ActionForm action={closeAlertAction} submitLabel="Close alert" variant="secondary">
                  <input type="hidden" name="alertId" value={a.id} />
                  <p className="text-sm text-ink-3">
                    {urgent
                      ? "Needs a review decision with a written note and at least one recorded contact attempt."
                      : "Needs a recorded review decision."}
                  </p>
                </ActionForm>
              </div>
            </Panel>
          ) : null}

          <Panel title="Case">
            {linkedCase ? (
              <div className="grid gap-2 text-sm">
                {a.cases.map(({ case: c }) => (
                  <p key={c.id}>
                    <Link href={`/counsellor/cases/${c.id}`} className={linkClass}>
                      Case <Ref>{c.reference}</Ref>
                    </Link>{" "}
                    <span className="text-ink-3">{CASE_STATUS_LABEL[c.status]}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-ink-3">This alert is not on a case yet.</p>
            )}
            <div className={linkedCase ? "mt-4" : undefined}>
              <ActionForm action={openCaseFromAlertAction} submitLabel={linkedCase ? "Go to the open case" : "Open a case"} variant="secondary">
                <input type="hidden" name="alertId" value={a.id} />
              </ActionForm>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
