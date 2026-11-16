import type { Metadata } from "next";
import { BellIcon } from "@phosphor-icons/react/dist/ssr";
import { MarkAllReadForm, OpenNotificationForm } from "@/components/auth/inbox-forms";
import { EmptyState, PageHeader, StatusPill, When } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { accessText } from "@/lib/i18n/access";
import { listOwnNotifications } from "@/lib/services/inbox";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await requireActor();
  const locale = actor.role === "STUDENT" ? actor.locale : "en";
  const t = accessText(locale).inbox;
  const items = await listOwnNotifications(actor, { limit: 50 });
  const unread = items.filter((i) => !i.read).length;

  return (
    <div lang={locale === "hi" ? "hi-IN" : undefined} className="grid gap-6">
      <PageHeader title={t.title} description={t.intro} actions={unread > 0 ? <MarkAllReadForm label={t.markAll} /> : undefined} />

      {items.length === 0 ? (
        <EmptyState icon={<BellIcon size={28} aria-hidden />} title={t.empty} />
      ) : (
        <ul aria-label={t.caption} className="grid gap-px overflow-hidden rounded-panel border border-line bg-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className={item.read ? "text-ink-2" : "font-medium text-ink"}>{item.text}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                  <When date={item.createdAt}>{fmtDateTime(item.createdAt)}</When>
                  <StatusPill tone={item.read ? "neutral" : "accent"}>{item.read ? t.read : t.unread}</StatusPill>
                </p>
              </div>
              {item.link ? (
                <OpenNotificationForm id={item.id} label={t.open} variant="primary" />
              ) : !item.read ? (
                <OpenNotificationForm id={item.id} label={t.markRead} variant="secondary" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
