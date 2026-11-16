import type { UserActor } from "@/lib/actor";
import { now } from "@/lib/clock";
import { db } from "@/lib/db";
import { fail } from "@/lib/errors";
import { notificationText } from "@/lib/services/notifications";

/** The person's own in-app notifications. Text is resolved from the template at read time, so a
 * stored row never carries details about care. */

export type InboxItem = { id: string; text: string; link: string | null; createdAt: Date; read: boolean };

/** Only links that stay inside the app are ever followed. */
export function safeInternalLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") && !link.includes("\\") ? link : null;
}

export async function listOwnNotifications(actor: UserActor, opts: { limit?: number } = {}): Promise<InboxItem[]> {
  const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await db.notification.findMany({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  // Staff screens are English; the stored staff templates have no separate Hindi wording.
  const locale = actor.role === "STUDENT" ? actor.locale : "en";
  return rows.map((r) => ({
    id: r.id,
    text: notificationText(r.template, locale),
    link: safeInternalLink(r.link),
    createdAt: r.createdAt,
    read: r.readAt !== null,
  }));
}

/** Marks one of the actor's notifications as read and returns where it points, if anywhere. */
export async function markNotificationRead(actor: UserActor, id: string): Promise<{ link: string | null }> {
  const row = await db.notification.findFirst({ where: { id, userId: actor.userId }, select: { id: true, link: true, readAt: true } });
  if (!row) fail("NOT_FOUND", "That notification was not found.");
  if (row.readAt === null) {
    await db.notification.updateMany({ where: { id: row.id, userId: actor.userId, readAt: null }, data: { readAt: now() } });
  }
  return { link: safeInternalLink(row.link) };
}

export async function markAllNotificationsRead(actor: UserActor): Promise<number> {
  const result = await db.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: now() } });
  return result.count;
}
