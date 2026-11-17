import type { ConsultationMode } from "@prisma/client";
import { systemActor, type UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, roleCan, tenantOf } from "@/lib/auth/permissions";
import { DAY, MINUTE, now } from "@/lib/clock";
import { decryptOptional } from "@/lib/crypto";
import { db, runTx, type DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { logCaseEvent, markMilestone } from "@/lib/services/cases";
import { notify } from "@/lib/services/notifications";

/** Cancellation reasons are stored as codes, never as typed text (the column is not encrypted). */
export const CANCEL_REASONS = ["SCHEDULE_CONFLICT", "FEELING_BETTER", "NO_LONGER_NEEDED", "OTHER"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

function normaliseReason(reason: string | null | undefined): CancelReason | null {
  const code = reason?.trim().toUpperCase();
  if (!code) return null;
  return (CANCEL_REASONS as readonly string[]).includes(code) ? (code as CancelReason) : "OTHER";
}

const MAX_SLOTS_PER_REQUEST = 60;

// ---------- Slots ----------

export async function listOpenSlots(
  actor: UserActor,
  filter: { professionalId?: string; from: Date; to: Date },
) {
  if (!roleCan(actor.role, "appointment.book") && !roleCan(actor.role, "availability.manage")) {
    fail("FORBIDDEN", "You do not have permission for this action.");
  }
  const institutionId = tenantOf(actor);
  const t = now();
  const from = filter.from.getTime() > t.getTime() ? filter.from : t;
  return db.availabilitySlot.findMany({
    where: {
      institutionId,
      status: "OPEN",
      startsAt: { gt: from, lt: filter.to },
      ...(filter.professionalId ? { professionalId: filter.professionalId } : {}),
      professional: { is: { status: "ACTIVE", professional: { is: { verification: "VERIFIED" } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 500,
    select: { id: true, professionalId: true, startsAt: true, endsAt: true, mode: true },
  });
}

/** The clinician's own upcoming slots in every state, for the availability page. */
export async function listOwnSlots(actor: UserActor) {
  assertCan(actor, "availability.manage");
  const institutionId = tenantOf(actor);
  return db.availabilitySlot.findMany({
    where: { institutionId, professionalId: actor.userId, startsAt: { gte: now() } },
    orderBy: { startsAt: "asc" },
    take: 300,
    select: { id: true, startsAt: true, endsAt: true, mode: true, status: true, appointmentId: true },
  });
}

export async function createSlots(
  actor: UserActor,
  input: { startsAt: Date[]; durationMinutes: number; mode: ConsultationMode },
): Promise<number> {
  assertCan(actor, "availability.manage");
  const institutionId = tenantOf(actor);
  const { durationMinutes, mode } = input;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 240 || durationMinutes % 5 !== 0) {
    fail("VALIDATION", "Choose a session length between 10 and 240 minutes, in steps of 5.");
  }
  if (mode !== "VIDEO" && mode !== "IN_PERSON") fail("VALIDATION", "Choose video or in person.");
  const starts = [...new Map<number, Date>(input.startsAt.map((d): [number, Date] => [d.getTime(), d])).values()].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  if (starts.length === 0) fail("VALIDATION", "Add at least one start time.");
  if (starts.length > MAX_SLOTS_PER_REQUEST) fail("VALIDATION", `Add at most ${MAX_SLOTS_PER_REQUEST} times at once.`);
  if (starts.some((d) => Number.isNaN(d.getTime()))) fail("VALIDATION", "One of the times is not valid.");
  const t = now();
  if (starts.some((d) => d.getTime() <= t.getTime())) fail("VALIDATION", "Times must be in the future.");
  const lengthMs = durationMinutes * MINUTE;
  for (let i = 1; i < starts.length; i++) {
    const prev = starts[i - 1];
    const cur = starts[i];
    if (prev && cur && cur.getTime() < prev.getTime() + lengthMs) {
      fail("VALIDATION", "Some of the times overlap each other. Leave at least one session length between start times.");
    }
  }

  return runTx(async (tx) => {
    const profile = await tx.professionalProfile.findUnique({ where: { userId: actor.userId } });
    if (mode === "VIDEO" && profile && !profile.offersVideo) {
      fail("VALIDATION", "Your profile does not offer video sessions. Choose in person.");
    }
    const first = starts[0] as Date;
    const last = starts[starts.length - 1] as Date;
    const existing = await tx.availabilitySlot.findMany({
      where: {
        institutionId,
        professionalId: actor.userId,
        startsAt: { lt: new Date(last.getTime() + lengthMs) },
        endsAt: { gt: first },
      },
      select: { startsAt: true, endsAt: true },
    });
    for (const s of starts) {
      const end = s.getTime() + lengthMs;
      if (existing.some((e) => s.getTime() < e.endsAt.getTime() && end > e.startsAt.getTime())) {
        fail("VALIDATION", "One of these times overlaps a slot you already have.");
      }
    }
    await tx.availabilitySlot.createMany({
      data: starts.map((s) => ({
        institutionId,
        professionalId: actor.userId,
        startsAt: s,
        endsAt: new Date(s.getTime() + lengthMs),
        mode,
        status: "OPEN" as const,
      })),
    });
    await recordAudit(tx, actor, {
      action: "availability.create",
      entityType: "AvailabilitySlot",
      metadata: { count: starts.length, durationMinutes, mode },
    });
    return starts.length;
  });
}

export async function removeSlot(actor: UserActor, slotId: string): Promise<void> {
  assertCan(actor, "availability.manage");
  const institutionId = tenantOf(actor);
  await runTx(async (tx) => {
    const res = await tx.availabilitySlot.deleteMany({
      where: { id: slotId, institutionId, professionalId: actor.userId, status: "OPEN", appointmentId: null },
    });
    if (res.count === 0) fail("NOT_FOUND", "That time was not found, or it has already been booked.");
    await recordAudit(tx, actor, { action: "availability.remove", entityType: "AvailabilitySlot", entityId: slotId });
  });
}

// ---------- Booking ----------

type ClaimInput = {
  institutionId: string;
  studentId: string;
  slotId: string;
  referralId: string | null;
  rescheduledFromId: string | null;
  professionalId: string | null;
  at: Date;
};

/** Claims an open slot with a compare-and-swap and creates the BOOKED appointment for it. */
async function claimSlot(tx: DbLike, p: ClaimInput): Promise<{ id: string; professionalId: string; startsAt: Date; endsAt: Date }> {
  const slot = await tx.availabilitySlot.findFirst({ where: { id: p.slotId, institutionId: p.institutionId } });
  if (!slot) fail("NOT_FOUND", "That time is not available.");
  if (slot.status !== "OPEN" || slot.startsAt.getTime() <= p.at.getTime()) {
    fail("SLOT_UNAVAILABLE", "That time has just been taken. Please choose another.");
  }
  if (p.professionalId && slot.professionalId !== p.professionalId) {
    fail("VALIDATION", "Choose another time with the same professional.");
  }
  const professional = await tx.user.findFirst({
    where: {
      id: slot.professionalId,
      institutionId: p.institutionId,
      role: "CLINICIAN",
      status: "ACTIVE",
      professional: { is: { verification: "VERIFIED" } },
    },
    select: { id: true },
  });
  if (!professional) fail("SLOT_UNAVAILABLE", "This professional is not taking bookings right now.");
  const clash = await tx.appointment.findFirst({
    where: {
      institutionId: p.institutionId,
      studentId: p.studentId,
      status: "BOOKED",
      startsAt: { lt: slot.endsAt },
      endsAt: { gt: slot.startsAt },
    },
    select: { id: true },
  });
  if (clash) fail("SLOT_UNAVAILABLE", "You already have an appointment at that time.");

  const claimed = await tx.availabilitySlot.updateMany({
    where: { id: slot.id, institutionId: p.institutionId, status: "OPEN" },
    data: { status: "BOOKED" },
  });
  if (claimed.count !== 1) fail("SLOT_UNAVAILABLE", "That time has just been taken. Please choose another.");

  const appointment = await tx.appointment.create({
    data: {
      institutionId: p.institutionId,
      studentId: p.studentId,
      professionalId: slot.professionalId,
      referralId: p.referralId,
      slotId: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      mode: slot.mode,
      status: "BOOKED",
      rescheduledFromId: p.rescheduledFromId,
      createdAt: p.at,
    },
  });
  await tx.availabilitySlot.update({ where: { id: slot.id }, data: { appointmentId: appointment.id } });
  return { id: appointment.id, professionalId: slot.professionalId, startsAt: slot.startsAt, endsAt: slot.endsAt };
}

export async function bookAppointment(
  actor: UserActor,
  input: { slotId: string; referralId?: string | null },
): Promise<{ appointmentId: string }> {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  return runTx(async (tx) => {
    const t = now();
    let referral: { id: string; caseId: string } | null = null;
    if (input.referralId) {
      const r = await tx.referral.findFirst({
        where: { id: input.referralId, institutionId, studentId: actor.userId },
        select: { id: true, caseId: true, status: true },
      });
      if (!r) fail("NOT_FOUND", "That suggestion was not found.");
      if (r.status !== "CREATED" && r.status !== "NOT_ATTENDED") {
        fail("INVALID_TRANSITION", "That suggestion already has an appointment, or is no longer open.");
      }
      referral = { id: r.id, caseId: r.caseId };
    }

    const appt = await claimSlot(tx, {
      institutionId,
      studentId: actor.userId,
      slotId: input.slotId,
      referralId: referral?.id ?? null,
      rescheduledFromId: null,
      professionalId: null,
      at: t,
    });

    if (referral) {
      await tx.referral.update({ where: { id: referral.id }, data: { status: "BOOKED", updatedAt: t } });
      await markMilestone(tx, referral.caseId, "ARRANGED", actor.userId, "Appointment booked from a suggested referral");
    }
    await notify(tx, actor.userId, "appointment_booked", { institutionId, link: `/student/appointments/${appt.id}` });
    await notify(tx, appt.professionalId, "staff_appointment_booked", { institutionId, link: `/clinician/appointments/${appt.id}` });
    await recordAudit(tx, actor, {
      action: "appointment.book",
      entityType: "Appointment",
      entityId: appt.id,
      metadata: { slotId: input.slotId, professionalId: appt.professionalId, referralId: referral?.id ?? null },
    });
    return { appointmentId: appt.id };
  });
}

export async function cancelAppointment(actor: UserActor, appointmentId: string, reason?: string | null): Promise<void> {
  const asStudent = roleCan(actor.role, "appointment.book");
  const asClinician = roleCan(actor.role, "consultation.conduct");
  if (!asStudent && !asClinician) fail("FORBIDDEN", "You do not have permission for this action.");
  const institutionId = tenantOf(actor);
  await runTx(async (tx) => {
    const appt = await tx.appointment.findFirst({
      where: { id: appointmentId, institutionId, ...(asStudent ? { studentId: actor.userId } : { professionalId: actor.userId }) },
    });
    if (!appt) fail("NOT_FOUND", "Appointment not found.");
    const t = now();
    if (appt.status !== "BOOKED") fail("INVALID_TRANSITION", "Only a booked appointment can be cancelled.");
    if (appt.startsAt.getTime() <= t.getTime()) fail("INVALID_TRANSITION", "This appointment has already started, so it cannot be cancelled.");

    const code = normaliseReason(reason);
    const updated = await tx.appointment.updateMany({
      where: { id: appt.id, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: t, cancelledById: actor.userId, cancelReason: code },
    });
    if (updated.count !== 1) fail("INVALID_TRANSITION", "Only a booked appointment can be cancelled.");
    await tx.availabilitySlot.updateMany({ where: { appointmentId: appt.id }, data: { status: "OPEN", appointmentId: null } });

    if (appt.referralId) {
      const referral = await tx.referral.findFirst({ where: { id: appt.referralId, institutionId } });
      if (referral) {
        if (referral.status === "BOOKED") {
          await tx.referral.update({ where: { id: referral.id }, data: { status: "CREATED", updatedAt: t } });
        }
        await markMilestone(
          tx,
          referral.caseId,
          "APPOINTMENT_UPDATED",
          actor.userId,
          asStudent ? "Student cancelled the appointment. The suggestion is open for rebooking" : "Clinician cancelled the appointment. The suggestion is open for rebooking",
        );
      }
    }
    if (asStudent) {
      await notify(tx, appt.professionalId, "staff_appointment_cancelled", { institutionId, link: `/clinician/appointments/${appt.id}` });
    } else {
      await notify(tx, appt.studentId, "appointment_cancelled", { institutionId, link: "/student/care" });
    }
    await recordAudit(tx, actor, {
      action: "appointment.cancel",
      entityType: "Appointment",
      entityId: appt.id,
      metadata: { by: asStudent ? "student" : "clinician", reason: code },
    });
  });
}

export async function rescheduleAppointment(
  actor: UserActor,
  appointmentId: string,
  newSlotId: string,
): Promise<{ appointmentId: string }> {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  return runTx(async (tx) => {
    const old = await tx.appointment.findFirst({ where: { id: appointmentId, institutionId, studentId: actor.userId } });
    if (!old) fail("NOT_FOUND", "Appointment not found.");
    const t = now();
    if (old.status !== "BOOKED") fail("INVALID_TRANSITION", "Only a booked appointment can be moved.");
    if (old.startsAt.getTime() <= t.getTime()) fail("INVALID_TRANSITION", "This appointment has already started, so it cannot be moved.");
    if (old.slotId === newSlotId) fail("VALIDATION", "Choose a different time.");

    const released = await tx.appointment.updateMany({
      where: { id: old.id, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: t, cancelledById: actor.userId, cancelReason: "RESCHEDULED" },
    });
    if (released.count !== 1) fail("INVALID_TRANSITION", "Only a booked appointment can be moved.");
    await tx.availabilitySlot.updateMany({ where: { appointmentId: old.id }, data: { status: "OPEN", appointmentId: null } });

    const next = await claimSlot(tx, {
      institutionId,
      studentId: actor.userId,
      slotId: newSlotId,
      referralId: old.referralId,
      rescheduledFromId: old.id,
      professionalId: old.professionalId,
      at: t,
    });

    if (old.referralId) {
      const referral = await tx.referral.findFirst({ where: { id: old.referralId, institutionId } });
      if (referral) await markMilestone(tx, referral.caseId, "APPOINTMENT_UPDATED", actor.userId, "Student moved the appointment to another time");
    }
    await notify(tx, actor.userId, "appointment_booked", { institutionId, link: `/student/appointments/${next.id}` });
    await notify(tx, next.professionalId, "staff_appointment_booked", { institutionId, link: `/clinician/appointments/${next.id}` });
    await recordAudit(tx, actor, {
      action: "appointment.reschedule",
      entityType: "Appointment",
      entityId: next.id,
      metadata: { fromAppointmentId: old.id, slotId: newSlotId },
    });
    return { appointmentId: next.id };
  });
}

// ---------- Referral suggestions the student can act on ----------

/** The student's own suggestions that still need a booking: CREATED or NOT_ATTENDED. */
export async function listRecommendedReferrals(actor: UserActor) {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  return db.referral.findMany({
    where: { institutionId, studentId: actor.userId, status: { in: ["CREATED", "NOT_ATTENDED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, service: true, status: true, createdAt: true, professionalId: true },
  });
}

/** "Not now": the student sets a suggestion aside. The care team can offer it again. */
export async function declineOwnReferral(actor: UserActor, referralId: string): Promise<void> {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  await runTx(async (tx) => {
    const referral = await tx.referral.findFirst({ where: { id: referralId, institutionId, studentId: actor.userId } });
    if (!referral) fail("NOT_FOUND", "That suggestion was not found.");
    if (referral.status !== "CREATED" && referral.status !== "NOT_ATTENDED") {
      fail("INVALID_TRANSITION", "That suggestion can no longer be set aside.");
    }
    const t = now();
    await tx.referral.update({ where: { id: referral.id }, data: { status: "DECLINED", updatedAt: t } });
    await logCaseEvent(tx, referral.caseId, "REFERRAL_DECLINED", "Student set the suggested appointment aside for now", actor.userId);
    await recordAudit(tx, actor, { action: "referral.decline", entityType: "Referral", entityId: referral.id });
  });
}

// ---------- Reads ----------

export async function listOwnAppointments(actor: UserActor) {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  return db.appointment.findMany({
    where: { institutionId, studentId: actor.userId },
    orderBy: { startsAt: "desc" },
    take: 100,
    include: { professional: { select: { id: true, name: true, professional: { select: { profession: true, qualifications: true } } } } },
  });
}

export async function getOwnAppointment(actor: UserActor, appointmentId: string) {
  assertCan(actor, "appointment.book");
  const institutionId = tenantOf(actor);
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, institutionId, studentId: actor.userId },
    include: { professional: { select: { id: true, name: true, professional: { select: { profession: true, qualifications: true } } } } },
  });
  if (!appt) fail("NOT_FOUND", "Appointment not found.");
  return appt;
}

export async function listClinicianSchedule(actor: UserActor, range: { from: Date; to: Date }) {
  assertCan(actor, "consultation.conduct");
  const institutionId = tenantOf(actor);
  return db.appointment.findMany({
    where: { institutionId, professionalId: actor.userId, startsAt: { gte: range.from, lt: range.to } },
    orderBy: { startsAt: "asc" },
    take: 300,
    include: {
      student: { select: { id: true, name: true } },
      consultation: { select: { status: true } },
    },
  });
}

/** One appointment for its clinician, with the student's department and the decrypted
 * referral reason the care team recorded. Reading it is audited. */
export async function getClinicianAppointment(actor: UserActor, appointmentId: string) {
  assertCan(actor, "consultation.conduct");
  const institutionId = tenantOf(actor);
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, institutionId, professionalId: actor.userId },
    include: {
      student: { select: { id: true, name: true, student: { select: { studentNumber: true, department: { select: { name: true } } } } } },
      referral: { select: { id: true, service: true, status: true, reasonCt: true } },
      consultation: { select: { id: true, status: true, studentJoinedAt: true, clinicianJoinedAt: true, startedAt: true, endedAt: true } },
    },
  });
  if (!appt) fail("NOT_FOUND", "Appointment not found.");
  await recordAudit(db, actor, {
    action: "appointment.view",
    entityType: "Appointment",
    entityId: appt.id,
    metadata: { studentId: appt.studentId },
  });
  return {
    ...appt,
    referral: appt.referral ? { id: appt.referral.id, service: appt.referral.service, status: appt.referral.status, reason: decryptOptional(appt.referral.reasonCt) } : null,
  };
}

// ---------- Scheduled work ----------

/**
 * Called by the scheduled tick. BOOKED appointments that start within the next 24 hours and have
 * not been reminded yet notify the student once. Returns the number of reminders sent.
 */
export async function sendAppointmentReminders(institutionId: string, at: Date): Promise<number> {
  const horizon = new Date(at.getTime() + DAY);
  return runTx(async (tx) => {
    const due = await tx.appointment.findMany({
      where: { institutionId, status: "BOOKED", reminderSentAt: null, startsAt: { gte: at, lte: horizon } },
      select: { id: true, studentId: true },
      orderBy: { startsAt: "asc" },
      take: 500,
    });
    let sent = 0;
    for (const a of due) {
      const marked = await tx.appointment.updateMany({ where: { id: a.id, reminderSentAt: null, status: "BOOKED" }, data: { reminderSentAt: at } });
      if (marked.count !== 1) continue;
      await notify(tx, a.studentId, "appointment_reminder", { institutionId, link: `/student/appointments/${a.id}` });
      sent += 1;
    }
    if (sent > 0) {
      await recordAudit(tx, systemActor("scheduler", institutionId), {
        action: "appointment.reminders_sent",
        entityType: "Appointment",
        metadata: { count: sent },
      });
    }
    return sent;
  });
}
