import type { AppointmentStatus, ConsultationMode } from "@prisma/client";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, can, isPlatformAdminInstitutionContext, tenantOf } from "@/lib/auth/permissions";
import { MINUTE, now } from "@/lib/clock";
import { randomToken } from "@/lib/crypto";
import { db, runTx } from "@/lib/db";
import { fail } from "@/lib/errors";
import { markMilestone } from "@/lib/services/cases";
import { configuredVideoProvider, getVideoProvider, type JoinInfo } from "@/lib/video";

export const JOIN_OPENS_BEFORE_MS = 15 * MINUTE;
export const JOIN_CLOSES_AFTER_MS = 30 * MINUTE;
/** Rooms outlive the join window a little so a session that overruns is not cut off. */
const ROOM_EXPIRY_AFTER_END_MS = 60 * MINUTE;

/** Follow-up kinds a clinician can schedule when completing a consultation. */
export const FOLLOW_UP_KINDS = {
  CHECK_IN: "Check-in",
  REASSESSMENT: "Reassessment",
  MEDICATION_REVIEW: "Medication review",
  COUNSELLING_SESSION: "Counselling session",
} as const;
export type FollowUpKind = keyof typeof FOLLOW_UP_KINDS;

export type JoinState = "too_early" | "open" | "closed" | "cancelled";
type RoomRole = "student" | "clinician";

export type RoomView = {
  appointmentId: string;
  role: RoomRole;
  mode: ConsultationMode;
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  joinOpensAt: Date;
  joinClosesAt: Date;
  joinState: JoinState;
  counterpartName: string;
  consultation: { status: string; studentJoined: boolean; clinicianJoined: boolean } | null;
  /** Present only when the room is open, the session is video and the provider answered. */
  join: JoinInfo | null;
};

export function joinWindow(a: { startsAt: Date; endsAt: Date }): { opensAt: Date; closesAt: Date } {
  return { opensAt: new Date(a.startsAt.getTime() - JOIN_OPENS_BEFORE_MS), closesAt: new Date(a.endsAt.getTime() + JOIN_CLOSES_AFTER_MS) };
}

export function joinStateOf(a: { status: AppointmentStatus; startsAt: Date; endsAt: Date }, at: Date): JoinState {
  if (a.status === "CANCELLED") return "cancelled";
  if (a.status !== "BOOKED") return "closed";
  const w = joinWindow(a);
  if (at.getTime() < w.opensAt.getTime()) return "too_early";
  if (at.getTime() > w.closesAt.getTime()) return "closed";
  return "open";
}

async function loadForRoom(actor: UserActor, appointmentId: string) {
  const institutionId = tenantOf(actor);
  let role: RoomRole;
  if (can(actor, "appointment.book")) role = "student";
  else if (can(actor, "consultation.conduct")) role = "clinician";
  else return fail("FORBIDDEN", "You do not have permission for this action.");
  const appt = await db.appointment.findFirst({
    where: {
      id: appointmentId,
      institutionId,
      ...(role === "student" ? { studentId: actor.userId } : isPlatformAdminInstitutionContext(actor) ? {} : { professionalId: actor.userId }),
    },
    include: {
      student: { select: { name: true } },
      professional: { select: { name: true } },
      consultation: true,
    },
  });
  if (!appt) fail("NOT_FOUND", "Appointment not found.");
  return { appt, role, institutionId };
}

/** Creates the consultation record and, for a hosted provider, its private room. Recording is
 * always off. Safe to call twice: a concurrent creator's row wins. */
async function ensureConsultation(appt: { id: string; institutionId: string; endsAt: Date }) {
  const existing = await db.consultation.findUnique({ where: { appointmentId: appt.id } });
  if (existing) return existing;
  const provider = configuredVideoProvider();
  const roomName = `cc-${randomToken(12)}`;
  try {
    await provider.createRoom({ roomName, expiresAt: new Date(appt.endsAt.getTime() + ROOM_EXPIRY_AFTER_END_MS) });
  } catch (error) {
    console.error("[video] could not create a room", error);
    fail("VALIDATION", "The video service is not available right now. Please try again in a few minutes.");
  }
  return db.consultation.upsert({
    where: { appointmentId: appt.id },
    update: {},
    create: {
      appointmentId: appt.id,
      institutionId: appt.institutionId,
      provider: provider.name,
      roomName,
      status: "WAITING",
      recordingEnabled: false,
    },
  });
}

export async function getConsultationRoom(actor: UserActor, appointmentId: string): Promise<RoomView> {
  const { appt, role } = await loadForRoom(actor, appointmentId);
  const t = now();
  const w = joinWindow(appt);
  const joinState = joinStateOf(appt, t);

  let consultation = appt.consultation;
  let join: JoinInfo | null = null;
  if (joinState === "open" && appt.mode === "VIDEO") {
    consultation = await ensureConsultation(appt);
    try {
      join = await getVideoProvider(consultation.provider).joinInfo({
        roomName: consultation.roomName,
        role,
        displayName: actor.name,
        expiresAt: new Date(appt.endsAt.getTime() + ROOM_EXPIRY_AFTER_END_MS),
      });
    } catch (error) {
      console.error("[video] could not prepare join details", error);
      fail("VALIDATION", "The video service is not available right now. Please try again in a few minutes.");
    }
  }
  return {
    appointmentId: appt.id,
    role,
    mode: appt.mode,
    status: appt.status,
    startsAt: appt.startsAt,
    endsAt: appt.endsAt,
    joinOpensAt: w.opensAt,
    joinClosesAt: w.closesAt,
    joinState,
    counterpartName: role === "student" ? appt.professional.name : appt.student.name,
    consultation: consultation
      ? { status: consultation.status, studentJoined: !!consultation.studentJoinedAt, clinicianJoined: !!consultation.clinicianJoinedAt }
      : null,
    join,
  };
}

/** Records that this person entered the room. The consultation starts once both have joined. */
export async function markJoined(actor: UserActor, appointmentId: string): Promise<{ status: string }> {
  const { appt, role, institutionId } = await loadForRoom(actor, appointmentId);
  if (appt.mode !== "VIDEO") fail("VALIDATION", "This appointment is in person, so there is no video room.");
  if (joinStateOf(appt, now()) !== "open") {
    fail("INVALID_TRANSITION", "The room opens 15 minutes before the start and closes 30 minutes after the end.");
  }
  const consultation = await ensureConsultation(appt);
  return runTx(async (tx) => {
    const c = await tx.consultation.findUniqueOrThrow({ where: { id: consultation.id } });
    const t = now();
    const studentJoinedAt = c.studentJoinedAt ?? (role === "student" ? t : null);
    const clinicianJoinedAt = c.clinicianJoinedAt ?? (role === "clinician" ? t : null);
    const both = !!studentJoinedAt && !!clinicianJoinedAt;
    const start = both && !c.startedAt && c.status !== "ENDED";
    const updated = await tx.consultation.update({
      where: { id: c.id },
      data: {
        studentJoinedAt,
        clinicianJoinedAt,
        ...(start ? { startedAt: t, status: "IN_PROGRESS" } : {}),
      },
    });
    await recordAudit(tx, actor, {
      action: "consultation.join",
      entityType: "Consultation",
      entityId: c.id,
      institutionId,
      metadata: { role, appointmentId: appt.id },
    });
    return { status: updated.status };
  });
}

/** The clinician records the outcome. Attended completes the appointment; not attended marks it
 * as missed. The referral and case history follow. An optional follow-up is scheduled. */
export async function completeConsultation(
  actor: UserActor,
  appointmentId: string,
  input: { attended: boolean; followUp?: { dueAt: Date; kind: string } | null },
): Promise<void> {
  assertCan(actor, "consultation.conduct");
  const institutionId = tenantOf(actor);
  const followUp = input.followUp ?? null;
  let kind: FollowUpKind | null = null;
  if (followUp) {
    const key = followUp.kind.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (!(key in FOLLOW_UP_KINDS)) fail("VALIDATION", "Choose a follow-up type from the list.");
    kind = key as FollowUpKind;
    if (Number.isNaN(followUp.dueAt.getTime()) || followUp.dueAt.getTime() <= now().getTime()) {
      fail("VALIDATION", "Choose a follow-up date in the future.");
    }
  }

  await runTx(async (tx) => {
    const appt = await tx.appointment.findFirst({
      where: { id: appointmentId, institutionId, ...(isPlatformAdminInstitutionContext(actor) ? {} : { professionalId: actor.userId }) },
    });
    if (!appt) fail("NOT_FOUND", "Appointment not found.");
    const t = now();
    if (appt.status !== "BOOKED") fail("INVALID_TRANSITION", "This consultation has already been recorded or the appointment was cancelled.");
    if (t.getTime() < appt.startsAt.getTime() - JOIN_OPENS_BEFORE_MS) {
      fail("INVALID_TRANSITION", "You can record the outcome from 15 minutes before the start time.");
    }
    const moved = await tx.appointment.updateMany({
      where: { id: appt.id, status: "BOOKED" },
      data: { status: input.attended ? "COMPLETED" : "NO_SHOW" },
    });
    if (moved.count !== 1) fail("INVALID_TRANSITION", "This consultation has already been recorded.");
    await tx.consultation.updateMany({ where: { appointmentId: appt.id, status: { not: "ENDED" } }, data: { status: "ENDED", endedAt: t } });

    let caseId: string | null = null;
    if (appt.referralId) {
      const referral = await tx.referral.findFirst({ where: { id: appt.referralId, institutionId } });
      if (referral) {
        caseId = referral.caseId;
        if (referral.status === "BOOKED") {
          await tx.referral.update({ where: { id: referral.id }, data: { status: input.attended ? "ATTENDED" : "NOT_ATTENDED", updatedAt: t } });
        }
        await markMilestone(
          tx,
          referral.caseId,
          "APPOINTMENT_UPDATED",
          actor.userId,
          input.attended ? "Consultation completed" : "Student did not attend the consultation",
        );
      }
    }

    if (followUp && kind) {
      await tx.followUp.create({
        data: {
          institutionId,
          caseId,
          appointmentId: appt.id,
          studentId: appt.studentId,
          assignedToId: actor.userId,
          kind,
          dueAt: followUp.dueAt,
          createdById: actor.userId,
          createdAt: t,
        },
      });
      if (caseId) await markMilestone(tx, caseId, "FOLLOW_UP_SCHEDULED", actor.userId, "Follow-up scheduled after the consultation");
    }

    await recordAudit(tx, actor, {
      action: "consultation.complete",
      entityType: "Appointment",
      entityId: appt.id,
      metadata: { attended: input.attended, followUp: !!followUp },
    });
  });
}
