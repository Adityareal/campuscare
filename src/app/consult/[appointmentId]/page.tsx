import type { Metadata } from "next";
import { ConsultationRoom } from "@/components/telehealth/consultation-room";
import { orNotFound } from "@/components/telehealth/or-not-found";
import { ButtonLink, Notice } from "@/components/ui";
import { requireStudent } from "@/lib/auth/guards";
import { requireActor } from "@/lib/auth/session";
import { fmtTime, fmtWeekday } from "@/lib/format";
import { fill, getDictionary } from "@/lib/i18n";
import { care, getCareText } from "@/lib/i18n/care";
import { getConsultationRoom } from "@/lib/services/consultations";
import { joinConsultationAction } from "@/app/consult/[appointmentId]/actions";

export const metadata: Metadata = { title: "Session", robots: { index: false, follow: false } };

export default async function ConsultPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const actor = await requireActor(["STUDENT", "CLINICIAN"]);
  if (actor.role === "STUDENT") await requireStudent();
  const isStudent = actor.role === "STUDENT";
  // Students see their own language. Staff pages are English.
  const c = isStudent ? getCareText(actor.locale) : care.en;
  const locale = isStudent ? actor.locale : "en";
  const recordingOff = c.recordingOff;
  const backHref = isStudent ? `/student/appointments/${appointmentId}` : `/clinician/appointments/${appointmentId}`;
  const backLabel = isStudent ? c.backToCare : "Back to the appointment";

  const room = await orNotFound(getConsultationRoom(actor, appointmentId));

  let body: React.ReactNode;
  if (room.mode !== "VIDEO") {
    body = <Notice tone="info">{c.consult.inPerson}</Notice>;
  } else if (room.joinState === "cancelled") {
    body = <Notice tone="info">{c.consult.cancelled}</Notice>;
  } else if (room.joinState === "too_early") {
    body = <Notice tone="info">{fill(c.consult.tooEarly, { time: fmtTime(room.joinOpensAt, locale) })}</Notice>;
  } else if (room.joinState === "closed" || !room.join) {
    body = <Notice tone="info">{c.consult.closed}</Notice>;
  } else {
    const counterpartJoined = room.consultation ? (isStudent ? room.consultation.clinicianJoined : room.consultation.studentJoined) : false;
    const alreadyJoined = room.consultation ? (isStudent ? room.consultation.studentJoined : room.consultation.clinicianJoined) : false;
    body = (
      <ConsultationRoom
        appointmentId={room.appointmentId}
        counterpartName={room.counterpartName}
        labels={c.consult}
        recordingOffText={recordingOff}
        join={{ kind: room.join.kind, url: room.join.url }}
        counterpartJoined={counterpartJoined}
        alreadyJoined={alreadyJoined}
        leaveHref={backHref}
        help={isStudent ? { href: "/help-now", label: getDictionary(actor.locale).common.getHelpNow } : null}
        joinAction={joinConsultationAction}
      />
    );
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-6 px-4 py-6 md:px-6">
      <header className="grid gap-1 border-b border-line pb-4">
        <p className="text-sm text-ink-3">CampusCare</p>
        <h1 className="text-2xl font-semibold tracking-tight">{c.consult.sessionTitle}</h1>
        <p className="text-ink-2">
          {fill(c.confirmWith, { name: room.counterpartName })}. {fill(c.confirmWhen, { day: fmtWeekday(room.startsAt, locale), time: fmtTime(room.startsAt, locale) })}
        </p>
      </header>

      {body}

      {room.joinState !== "open" || room.mode !== "VIDEO" ? (
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink variant="secondary" href={backHref}>
            {backLabel}
          </ButtonLink>
          {isStudent ? (
            <ButtonLink variant="ghost" href="/help-now">
              {getDictionary(actor.locale).common.getHelpNow}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
