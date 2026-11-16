import type { DbLike } from "@/lib/db";
import { now } from "@/lib/clock";

/**
 * Notification copy lives here, not in the database. `preview` is the only text that may
 * leave the authenticated app (push, SMS, email subject, lock screen) and it never names a
 * condition, a score, an alert or a service type. `inApp` is shown only inside the app.
 */
const STUDENT_PREVIEW = "You have a new update in CampusCare.";
const STAFF_PREVIEW = "You have a new item in CampusCare.";

type Template = { audience: "student" | "staff"; preview: string; inApp: { en: string; hi: string } };

export const NOTIFICATION_TEMPLATES = {
  appointment_booked: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "Your appointment is confirmed.", hi: "आपका अपॉइंटमेंट पक्का हो गया है।" } },
  appointment_cancelled: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "An appointment was cancelled.", hi: "एक अपॉइंटमेंट रद्द हुआ।" } },
  appointment_reminder: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "You have an appointment coming up.", hi: "आपका एक अपॉइंटमेंट जल्द है।" } },
  message_new: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "You have a new message from the care team.", hi: "केयर टीम से आपके लिए नया संदेश है।" } },
  assessment_requested: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "Your care team sent you a short questionnaire.", hi: "आपकी केयर टीम ने आपको एक छोटी प्रश्नावली भेजी है।" } },
  referral_new: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "Your care team suggested a next step.", hi: "आपकी केयर टीम ने अगला कदम सुझाया है।" } },
  help_received: { audience: "student", preview: STUDENT_PREVIEW, inApp: { en: "Your request reached the care team.", hi: "आपका अनुरोध केयर टीम तक पहुँच गया है।" } },
  staff_alert_new: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A new alert is waiting for review.", hi: "A new alert is waiting for review." } },
  staff_alert_urgent: { audience: "staff", preview: "Urgent: an item in CampusCare needs attention now.", inApp: { en: "An urgent alert needs review now.", hi: "An urgent alert needs review now." } },
  staff_help_request: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A student asked for support.", hi: "A student asked for support." } },
  staff_case_assigned: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A case was assigned to you.", hi: "A case was assigned to you." } },
  staff_message_new: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A student replied to a case message.", hi: "A student replied to a case message." } },
  staff_appointment_booked: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A student booked a session with you.", hi: "A student booked a session with you." } },
  staff_appointment_cancelled: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A session with you was cancelled.", hi: "A session with you was cancelled." } },
  staff_followup_due: { audience: "staff", preview: STAFF_PREVIEW, inApp: { en: "A follow-up is due.", hi: "A follow-up is due." } },
  staff_escalation_overdue: { audience: "staff", preview: "Urgent: an item in CampusCare is overdue.", inApp: { en: "An urgent alert has not been acknowledged in time.", hi: "An urgent alert has not been acknowledged in time." } },
} as const satisfies Record<string, Template>;

export type NotificationTemplate = keyof typeof NOTIFICATION_TEMPLATES;

export async function notify(
  client: DbLike,
  userIds: string | string[],
  template: NotificationTemplate,
  opts: { institutionId: string | null; link?: string },
): Promise<void> {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
  if (ids.length === 0) return;
  const createdAt = now();
  await client.notification.createMany({
    data: ids.map((userId) => ({ userId, template, link: opts.link ?? null, institutionId: opts.institutionId, createdAt })),
  });
}

export function notificationText(template: string, locale: "en" | "hi"): string {
  const t = (NOTIFICATION_TEMPLATES as Record<string, Template>)[template];
  return t ? t.inApp[locale] : "Update";
}

/** Active counsellors and clinicians of an institution: the authorised care team. */
export async function careTeamIds(client: DbLike, institutionId: string, roles: ("COUNSELLOR" | "CLINICIAN")[] = ["COUNSELLOR"]): Promise<string[]> {
  const rows = await client.user.findMany({
    where: { institutionId, role: { in: roles }, status: "ACTIVE" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
