import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/care/action-form";
import { FollowUpCompleteForm } from "@/components/care/follow-up-complete-form";
import { ALERT_STATUS_LABEL, CASE_SOURCE_LABEL, CASE_STATUS_LABEL, DEPARTMENT_NONE, ROLE_LABEL } from "@/components/care/labels";
import { LifecycleRail } from "@/components/care/lifecycle-rail";
import {
  Field,
  Input,
  KeyValueList,
  Notice,
  PageHeader,
  Panel,
  Ref,
  Select,
  StatusPill,
  Textarea,
  TriageBadge,
  When,
  linkClass,
} from "@/components/ui";
import { requireCareTeam } from "@/lib/auth/guards";
import { DAY, now } from "@/lib/clock";
import { isDomainError } from "@/lib/errors";
import { isoDay } from "@/lib/format";
import { listCareTeam } from "@/lib/services/alerts";
import { getCaseDetail } from "@/lib/services/cases";
import { FOLLOW_UP_KIND_LABEL, FOLLOW_UP_KINDS, FOLLOW_UP_STATUS_LABEL, followUpKindLabel } from "@/lib/services/followups";
import { HELP_TYPE_LABEL } from "@/lib/services/help";
import { listCaseMessages } from "@/lib/services/messages";
import {
  counsellorReferralTransitions,
  listReferralTargets,
  PROFESSION_LABEL,
  REFERRAL_SERVICES,
  REFERRAL_STATUS_LABEL,
  SERVICE_LABEL,
} from "@/lib/services/referrals";
import { completeFollowUpAction } from "../../follow-ups/actions";
import {
  addCaseNoteAction,
  assignCaseAction,
  closeCaseAction,
  createReferralAction,
  documentOutcomeAction,
  recordArrangedAction,
  recordContactedAction,
  reopenCaseAction,
  returnToMonitoringAction,
  scheduleFollowUpAction,
  sendCaseMessageAction,
  setMissedConcernAction,
  updateReferralStatusAction,
} from "./actions";

type Detail = Awaited<ReturnType<typeof getCaseDetail>>;

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "Missed",
};

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCareTeam();
  const { id } = await params;
  let c: Detail;
  try {
    c = await getCaseDetail(actor, id);
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [team, targets, thread] = await Promise.all([listCareTeam(actor), listReferralTargets(actor), listCaseMessages(actor, c.id)]);
  const closed = c.status === "CLOSED";
  const profile = c.student.student;
  const assignee = c.assignments[0] ? c.staffById.get(c.assignments[0].userId) : undefined;
  const today = isoDay(now());
  const nextWeek = isoDay(new Date(now().getTime() + 7 * DAY));
  const tomorrow = isoDay(new Date(now().getTime() + DAY));
  const teamName = new Map(team.map((m) => [m.id, m.name]));
  const staffName = (userId: string | null) =>
    userId ? (teamName.get(userId) ?? c.staffById.get(userId)?.name ?? (userId === c.studentId ? c.student.name : "A staff member")) : "System";
  const targetName = new Map(targets.map((t) => [t.userId, t.name]));
  const scheduled = c.followUps.filter((f) => f.status === "SCHEDULED");
  const finished = c.followUps.filter((f) => f.status !== "SCHEDULED");

  return (
    <>
      <PageHeader
        back={{ href: "/counsellor/cases", label: "Cases" }}
        title={c.student.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TriageBadge category={c.priority} />
            <Ref>{c.reference}</Ref>
            <StatusPill tone={closed ? "neutral" : "accent"}>{CASE_STATUS_LABEL[c.status]}</StatusPill>
            {c.missedConcern ? <StatusPill tone="info">Missed-concern review</StatusPill> : null}
            <span className="text-sm text-ink-3">
              {CASE_SOURCE_LABEL[c.source]}, opened <When date={c.openedAt} />
            </span>
          </span>
        }
        actions={
          <Link href={`/counsellor/students/${c.student.id}`} className={linkClass}>
            Student profile
          </Link>
        }
      />

      <Panel title="Lifecycle" description="Each step shows when it first happened." className="mb-6">
        <LifecycleRail c={c} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
          <Panel title="Linked alerts">
            {c.alerts.length === 0 ? (
              <p className="text-sm text-ink-3">No alerts are linked to this case.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.alerts.map(({ alert: a }) => (
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

          <Panel title="Help requests" description="What the student asked for, in their words.">
            {c.helpRequests.length === 0 ? (
              <p className="text-sm text-ink-3">No help requests on this case.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.helpRequests.map((h) => (
                  <li key={h.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{HELP_TYPE_LABEL[h.type]}</span>
                      {h.type === "URGENT_SUPPORT" ? <StatusPill tone="danger">Urgent request</StatusPill> : null}
                      <span className="text-ink-3">
                        <When date={h.createdAt} />
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-ink-2">{h.details ?? "No details given."}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Referrals" description="A referral alone never closes a case.">
            {c.referrals.length === 0 ? (
              <p className="mb-4 text-sm text-ink-3">No referrals yet.</p>
            ) : (
              <ul className="mb-6 divide-y divide-line">
                {c.referrals.map((r) => {
                  const next = counsellorReferralTransitions(r.status);
                  return (
                    <li key={r.id} className="grid gap-3 py-4 first:pt-0">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{SERVICE_LABEL[r.service]}</span>
                          <StatusPill tone={r.status === "CLOSED" || r.status === "DECLINED" ? "neutral" : "accent"}>
                            {REFERRAL_STATUS_LABEL[r.status]}
                          </StatusPill>
                        </p>
                        <p className="text-sm text-ink-3">
                          {r.professionalId ? `With ${targetName.get(r.professionalId) ?? "a clinician"}. ` : "No professional chosen. "}
                          Created <When date={r.createdAt} />
                        </p>
                        {r.reason ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{r.reason}</p> : null}
                      </div>
                      {r.appointments.length > 0 ? (
                        <ul className="grid gap-1 text-sm">
                          {r.appointments.map((ap) => (
                            <li key={ap.id}>
                              Appointment <When date={ap.startsAt} />, {ap.mode === "VIDEO" ? "video" : "in person"}:{" "}
                              {APPOINTMENT_STATUS_LABEL[ap.status] ?? ap.status}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {next.length > 0 && !closed ? (
                        <ActionForm action={updateReferralStatusAction} submitLabel="Update referral" variant="secondary" size="sm" className="gap-3">
                          <input type="hidden" name="caseId" value={c.id} />
                          <input type="hidden" name="referralId" value={r.id} />
                          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                            <Field id={`ref-${r.id}-status`} label="New status">
                              <Select id={`ref-${r.id}-status`} name="status" defaultValue={next[0]}>
                                {next.map((s) => (
                                  <option key={s} value={s}>
                                    {s === "CREATED" ? "Offer again" : REFERRAL_STATUS_LABEL[s]}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field id={`ref-${r.id}-note`} label="Note" optionalLabel="Optional">
                              <Input id={`ref-${r.id}-note`} name="note" maxLength={2000} />
                            </Field>
                          </div>
                        </ActionForm>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {!closed ? (
              <ActionForm action={createReferralAction} submitLabel="Create referral">
                <input type="hidden" name="caseId" value={c.id} />
                <h3 className="text-sm font-semibold">New referral</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="ref-service" label="Service">
                    <Select id="ref-service" name="service" defaultValue="CAMPUS_COUNSELLING">
                      {REFERRAL_SERVICES.map((s) => (
                        <option key={s} value={s}>
                          {SERVICE_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="ref-pro" label="Verified professional" optionalLabel="Optional" hint="Only clinicians with a verified profile are listed.">
                    <Select id="ref-pro" name="professionalId" defaultValue="" aria-describedby="ref-pro-hint">
                      <option value="">Let the student choose</option>
                      {targets.map((t) => (
                        <option key={t.userId} value={t.userId}>
                          {t.name}, {PROFESSION_LABEL[t.profession]}
                          {t.languages.length ? ` (${t.languages.join(", ")})` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field id="ref-reason" label="Reason" hint="Stored encrypted. The student does not see this text.">
                  <Textarea id="ref-reason" name="reason" required minLength={3} maxLength={2000} aria-describedby="ref-reason-hint" />
                </Field>
              </ActionForm>
            ) : null}
          </Panel>

          <Panel title="Follow-ups">
            {scheduled.length === 0 ? (
              <p className="mb-4 text-sm text-ink-3">No follow-ups scheduled.</p>
            ) : (
              <ul className="mb-6 divide-y divide-line">
                {scheduled.map((f) => (
                  <li key={f.id} className="grid gap-3 py-4 first:pt-0">
                    <p className="text-sm">
                      <span className="font-medium">{followUpKindLabel(f.kind)}</span>
                      <span className="text-ink-3">
                        {" "}
                        due <When date={f.dueAt} />, assigned to {staffName(f.assignedToId)}
                      </span>
                    </p>
                    <FollowUpCompleteForm action={completeFollowUpAction} followUpId={f.id} caseId={c.id} />
                  </li>
                ))}
              </ul>
            )}
            {finished.length > 0 ? (
              <ul className="mb-6 grid gap-2 text-sm">
                {finished.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium">{followUpKindLabel(f.kind)}</span>: {FOLLOW_UP_STATUS_LABEL[f.status]}
                    {f.completedAt ? (
                      <span className="text-ink-3">
                        {" "}
                        on <When date={f.completedAt} />
                      </span>
                    ) : null}
                    {f.outcome ? <p className="whitespace-pre-wrap text-ink-2">{f.outcome}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {!closed ? (
              <ActionForm action={scheduleFollowUpAction} submitLabel="Schedule follow-up">
                <input type="hidden" name="caseId" value={c.id} />
                <h3 className="text-sm font-semibold">Schedule a follow-up</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="fu-kind" label="Kind">
                    <Select id="fu-kind" name="kind" defaultValue="CHECK_IN_CALL">
                      {FOLLOW_UP_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {FOLLOW_UP_KIND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="fu-assignee" label="Assigned to">
                    <Select id="fu-assignee" name="assignedToId" defaultValue={actor.userId}>
                      {team.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({ROLE_LABEL[m.role]})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="fu-date" label="Due date">
                    <Input id="fu-date" name="dueDate" type="date" min={today} defaultValue={nextWeek} required />
                  </Field>
                  <Field id="fu-time" label="Due time (India time)">
                    <Input id="fu-time" name="dueTime" type="time" defaultValue="10:00" required />
                  </Field>
                </div>
              </ActionForm>
            ) : null}
          </Panel>

          <Panel title="Messages with the student" description="The student sees staff by first name and role only.">
            {thread.messages.length === 0 ? (
              <p className="mb-4 text-sm text-ink-3">No messages yet. Your first message counts as contacting the student.</p>
            ) : (
              <ol className="mb-6 grid gap-3">
                {thread.messages.map((m) => (
                  <li key={m.id} className={m.fromStudent ? "rounded-panel bg-surface-2 px-4 py-3" : "rounded-panel border border-line px-4 py-3"}>
                    <p className="text-sm">
                      <span className="font-medium">{m.fromStudent ? `${m.senderName} (student)` : m.senderName}</span>
                      <span className="text-ink-3">
                        {" "}
                        <When date={m.createdAt} />
                        {!m.fromStudent ? (m.readAt ? ", read by the student" : ", not read yet") : null}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                  </li>
                ))}
              </ol>
            )}
            {!closed ? (
              <ActionForm action={sendCaseMessageAction} submitLabel="Send message" pendingLabel="Sending...">
                <input type="hidden" name="caseId" value={c.id} />
                <Field id="msg-body" label="Message to the student" hint="Write plainly. Do not include scores or labels the student has not seen.">
                  <Textarea id="msg-body" name="body" required maxLength={4000} aria-describedby="msg-body-hint" />
                </Field>
              </ActionForm>
            ) : (
              <p className="text-sm text-ink-3">The case is closed. Reopen it to write to the student.</p>
            )}
          </Panel>

          <Panel title="History" description="Most recent first.">
            {c.events.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing recorded yet.</p>
            ) : (
              <ol className="grid gap-0">
                {c.events.map((e) => (
                  <li key={e.id} className="grid gap-1 border-l-2 border-line py-3 pl-4">
                    <p className="text-sm">
                      <span className="font-medium">{e.summary}</span>
                      <span className="text-ink-3">
                        {" "}
                        by {staffName(e.actorId)}, <When date={e.createdAt} />
                      </span>
                    </p>
                    {e.detail ? <p className="whitespace-pre-wrap text-sm text-ink-2">{e.detail}</p> : null}
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
                { label: "Department", value: profile ? `${profile.department.name}, year ${profile.academicYear}` : DEPARTMENT_NONE },
                { label: "Student number", value: profile?.studentNumber ?? "-" },
                { label: "Phone", value: profile?.contactPhone ?? "Not recorded" },
                { label: "Email", value: c.student.email },
                { label: "Assigned to", value: assignee ? assignee.name : "Nobody yet" },
                ...(c.nextReviewAt ? [{ label: "Next review", value: <When date={c.nextReviewAt} /> }] : []),
              ]}
            />
          </Panel>

          {c.outcomeNote ? (
            <Panel title="Documented outcome">
              <p className="whitespace-pre-wrap text-sm">{c.outcomeNote}</p>
            </Panel>
          ) : null}

          <Panel title="Case actions">
            {closed ? (
              <div className="grid gap-4">
                <Notice>This case is closed.</Notice>
                <ActionForm action={reopenCaseAction} submitLabel="Reopen case" variant="secondary">
                  <input type="hidden" name="caseId" value={c.id} />
                </ActionForm>
              </div>
            ) : (
              <div className="grid gap-6">
                <ActionForm action={assignCaseAction} submitLabel="Assign" variant="secondary">
                  <input type="hidden" name="caseId" value={c.id} />
                  <Field id="case-assignee" label="Assign to">
                    <Select id="case-assignee" name="assigneeId" defaultValue={c.assignments[0]?.userId ?? ""} required>
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

                <ActionForm action={recordContactedAction} submitLabel="Record contact" variant="secondary">
                  <input type="hidden" name="caseId" value={c.id} />
                  <Field id="contacted-note" label="Student contacted" optionalLabel="Optional note">
                    <Input id="contacted-note" name="note" maxLength={2000} />
                  </Field>
                </ActionForm>

                <ActionForm action={recordArrangedAction} submitLabel="Record arranged" variant="secondary">
                  <input type="hidden" name="caseId" value={c.id} />
                  <Field id="arranged-note" label="Assessment or consultation arranged" optionalLabel="Optional note">
                    <Input id="arranged-note" name="note" maxLength={2000} />
                  </Field>
                </ActionForm>

                <ActionForm action={addCaseNoteAction} submitLabel="Add note" variant="secondary">
                  <input type="hidden" name="caseId" value={c.id} />
                  <Field id="case-note" label="Case note" hint="Stored encrypted.">
                    <Textarea id="case-note" name="note" required maxLength={2000} aria-describedby="case-note-hint" />
                  </Field>
                </ActionForm>

                <ActionForm action={documentOutcomeAction} submitLabel="Document outcome" variant="secondary">
                  <input type="hidden" name="caseId" value={c.id} />
                  <Field id="case-outcome" label="Outcome" hint="Needed before closing or returning to monitoring.">
                    <Textarea id="case-outcome" name="outcome" required minLength={10} maxLength={4000} aria-describedby="case-outcome-hint" />
                  </Field>
                </ActionForm>

                {c.status !== "MONITORING" ? (
                  <ActionForm action={returnToMonitoringAction} submitLabel="Return to monitoring" variant="secondary">
                    <input type="hidden" name="caseId" value={c.id} />
                    <Field id="monitor-date" label="Next review date" hint="A reassessment follow-up is scheduled for this date.">
                      <Input id="monitor-date" name="reviewDate" type="date" min={tomorrow} defaultValue={isoDay(new Date(now().getTime() + 28 * DAY))} required aria-describedby="monitor-date-hint" />
                    </Field>
                  </ActionForm>
                ) : (
                  <ActionForm action={reopenCaseAction} submitLabel="Make active again" variant="secondary">
                    <input type="hidden" name="caseId" value={c.id} />
                  </ActionForm>
                )}

                <ActionForm action={setMissedConcernAction} submitLabel={c.missedConcern ? "Remove missed-concern flag" : "Flag for missed-concern review"} variant="ghost">
                  <input type="hidden" name="caseId" value={c.id} />
                  <input type="hidden" name="missed" value={c.missedConcern ? "false" : "true"} />
                  <p className="text-sm text-ink-3">Use when the rules should have raised a concern earlier.</p>
                </ActionForm>

                <ActionForm action={closeCaseAction} submitLabel="Close case">
                  <input type="hidden" name="caseId" value={c.id} />
                  <p className="text-sm text-ink-3">Needs a documented outcome, every linked alert closed and no follow-up still scheduled.</p>
                </ActionForm>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
