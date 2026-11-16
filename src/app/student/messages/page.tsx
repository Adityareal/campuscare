import { ActionForm } from "@/components/care/action-form";
import { ButtonLink, EmptyState, Field, Notice, PageHeader, Panel, Ref, StatusPill, Textarea } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { tenantOf } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fmtDay, fmtTime } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { messagesCopy } from "@/lib/i18n/messages";
import { getInstitutionSettings } from "@/lib/services/config";
import { listStudentThreads, markThreadRead } from "@/lib/services/messages";
import { sendStudentMessageAction } from "./actions";

export default async function StudentMessagesPage() {
  const actor = await requireStudent();
  const t = getDictionary(actor.locale);
  const m = messagesCopy[actor.locale];
  const locale = actor.locale;
  const [threads, settings] = await Promise.all([listStudentThreads(actor), getInstitutionSettings(db, tenantOf(actor))]);

  // Opening the page counts as reading the care team's messages. The list above was loaded
  // first, so new messages are still marked as new on this view.
  await Promise.all(threads.filter((th) => th.unreadCount > 0).map((th) => markThreadRead(actor, th.caseId)));

  const when = (d: Date) => `${fmtDay(d, locale)}, ${fmtTime(d, locale)}`;

  return (
    <>
      <PageHeader title={t.messages.title} description={m.intro} />
      <Notice className="mb-6">{fill(t.messages.hoursNote, { hours: settings.careTeamHours })}</Notice>

      {threads.length === 0 ? (
        <EmptyState
          title={t.messages.empty}
          action={
            <ButtonLink href="/student/help" variant="secondary">
              {m.askSupport}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-6">
          {threads.map((th) => (
            <Panel
              key={th.caseId}
              title={th.assignee ? fill(m.withStaff, { name: `${th.assignee.firstName} (${m.roles[th.assignee.role]})` }) : m.withTeam}
              description={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{fill(m.threadStarted, { day: fmtDay(th.openedAt, locale) })}</span>
                  <Ref>{th.reference}</Ref>
                  {th.unreadCount > 0 ? <StatusPill tone="accent">{fill(m.unreadCount, { count: th.unreadCount })}</StatusPill> : null}
                </span>
              }
            >
              <section aria-label={`${m.conversationLabel} ${th.reference}`}>
                {th.messages.length === 0 ? (
                  <p className="mb-4 text-sm text-ink-3">{m.noMessagesYet}</p>
                ) : (
                  <ol className="mb-5 grid gap-3">
                    {th.messages.map((msg) => (
                      <li key={msg.id} className={msg.mine ? "rounded-panel bg-accent-soft px-4 py-3 md:ml-12" : "rounded-panel bg-surface-2 px-4 py-3 md:mr-12"}>
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">
                            {msg.mine ? t.messages.you : msg.staff ? fill(m.staffSender, { name: msg.staff.firstName, role: m.roles[msg.staff.role] }) : m.teamSender}
                          </span>
                          <time dateTime={msg.createdAt.toISOString()} className="text-ink-3">
                            {when(msg.createdAt)}
                          </time>
                          {msg.unread ? <StatusPill tone="accent">{m.newBadge}</StatusPill> : null}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{msg.body}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {th.open ? (
                  <ActionForm action={sendStudentMessageAction} submitLabel={t.messages.send} pendingLabel={t.messages.send}>
                    <input type="hidden" name="caseId" value={th.caseId} />
                    <Field id={`msg-${th.caseId}`} label={t.messages.label}>
                      <Textarea id={`msg-${th.caseId}`} name="body" required maxLength={4000} />
                    </Field>
                  </ActionForm>
                ) : (
                  <Notice
                    action={
                      <ButtonLink href="/student/help" variant="secondary">
                        {m.askSupport}
                      </ButtonLink>
                    }
                  >
                    {m.closedNote}
                  </Notice>
                )}
              </section>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
