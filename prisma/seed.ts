/**
 * Demo data for local development and walkthroughs. Run through `npm run db:reset`.
 *
 * Builds two fictional institutions and replays eight weeks of history through the real
 * services with the clock set to each moment. Every alert is raised by the risk engine from the
 * check-ins, questionnaires and requests it sees, and every acknowledgement, review and closure
 * goes through the human-review services, so response times and lifecycle data come from the
 * same code paths the app uses. Referrals, bookings, consultations, follow-ups and messages are
 * written directly (with the same encryption, audit entries and case milestones) to keep the
 * replay small.
 *
 * All people and phone numbers are fictional. Emails use the reserved .example domain.
 */
import "dotenv/config";
import type { Prisma } from "@/generated/prisma/client";
import type {
  AlertDecision,
  ConsultationMode,
  HelpRequestType,
  Instrument,
  Locale,
  Profession,
  ReferralService,
  ReviewerFeedback,
  Role,
  TriageCategory,
} from "@/generated/prisma/enums";
import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { DAY, HOUR, MINUTE, now, setClock } from "@/lib/clock";
import { encryptField, randomToken } from "@/lib/crypto";
import { closeDb, db } from "@/lib/db";
import { DEMO_INSTITUTION, DEMO_PERSONAS, SECOND_INSTITUTION } from "@/lib/demo";
import { isDomainError } from "@/lib/errors";
import { isoDay, istToUtc } from "@/lib/format";
import { DEFAULT_RULES } from "@/lib/risk/rules";
import { acknowledgeAlert, closeAlert, recordEscalationAttempt, reviewAlert } from "@/lib/services/alerts";
import { requestAssessment, startSelfAssessment, submitAssessment } from "@/lib/services/assessments";
import { assignCase, closeCase, documentOutcome, logCaseEvent, markMilestone, recordCaseAction } from "@/lib/services/cases";
import { submitCheckIn, type CheckInInput } from "@/lib/services/checkins";
import { recordConsentChoices } from "@/lib/services/consent";
import { requestHelp } from "@/lib/services/help";
import { notify } from "@/lib/services/notifications";
import { escalateOverdueUrgentAlerts } from "@/lib/services/risk";
import { bookAppointment } from "@/lib/services/scheduling";

process.env.CAMPUSCARE_SEEDING = "1";

// ---------- Deterministic randomness ----------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261115);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const chance = (p: number): boolean => rand() < p;
const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);
const clamp = (v: number, lo = 1, hi = 5): number => Math.max(lo, Math.min(hi, v));
const around = (mean: number, spread = 0.9): number => clamp(Math.round(mean + (rand() * 2 - 1) * spread));

// ---------- Time ----------

let BASE = new Date();

/** IST wall-clock time on a day relative to today (0 = today, -3 = three days ago). */
function dayAt(daysFromToday: number, hhmm: string): Date {
  return istToUtc(isoDay(new Date(BASE.getTime() + daysFromToday * DAY)), hhmm);
}
const minutesAgo = (m: number): Date => new Date(BASE.getTime() - m * MINUTE);
const later = (d: Date, ms: number): Date => new Date(d.getTime() + ms);

/** Moves a time into care-team hours (Monday to Saturday, 9:30 to 17:30 IST). */
function workingHours(d: Date): Date {
  let t = d;
  for (let i = 0; i < 10; i++) {
    const ist = new Date(t.getTime() + 330 * MINUTE);
    const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const sunday = ist.getUTCDay() === 0;
    if (!sunday && minutes >= 9 * 60 + 30 && minutes <= 17 * 60 + 30) return t;
    const dayStr = isoDay(minutes > 17 * 60 + 30 || sunday ? new Date(t.getTime() + DAY) : t);
    t = later(istToUtc(dayStr, "09:30"), Math.floor(between(0, 120)) * MINUTE);
  }
  return t;
}

// ---------- Event replay ----------

type SeedEvent = { at: Date; label: string; run: () => Promise<void> };
const queue: SeedEvent[] = [];

/** Queues work at a past moment. Moments after the seed start are not replayed. */
function schedule(at: Date, label: string, run: () => Promise<void>): void {
  const clock = now().getTime();
  const when = new Date(Math.max(at.getTime(), Math.min(clock, BASE.getTime())));
  if (when.getTime() > BASE.getTime()) return;
  const i = queue.findIndex((e) => e.at.getTime() > when.getTime());
  queue.splice(i === -1 ? queue.length : i, 0, { at: when, label, run });
}

/** Staff steps can race with the rules (an alert raised again, a case already closed). Those
 * expected refusals are skipped; anything else stops the seed. */
async function soft(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    if (!isDomainError(e)) throw e;
  }
}

async function drain(): Promise<number> {
  let count = 0;
  while (queue.length) {
    const ev = queue.shift()!;
    setClock(ev.at);
    try {
      await ev.run();
    } catch (e) {
      console.error(`[seed] step failed: ${ev.label} at ${ev.at.toISOString()}`);
      throw e;
    }
    count += 1;
  }
  return count;
}

// ---------- People ----------

type Person = { id: string; name: string; role: Role; institutionId: string | null; locale: Locale };

const actorOf = (p: Person): UserActor => ({ kind: "user", userId: p.id, role: p.role, institutionId: p.institutionId, name: p.name, locale: p.locale });

async function createPerson(p: { institutionId: string | null; name: string; email: string; role: Role; locale?: Locale; isDemo?: boolean }): Promise<Person> {
  const u = await db.user.create({
    data: {
      institutionId: p.institutionId,
      name: p.name,
      email: p.email,
      role: p.role,
      locale: p.locale ?? "en",
      isDemo: p.isDemo ?? false,
      createdAt: now(),
    },
  });
  return { id: u.id, name: u.name, role: u.role, institutionId: u.institutionId, locale: u.locale };
}

const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Ishaan", "Kabir", "Siddharth", "Karthik", "Pranav", "Yash", "Harsh", "Manav", "Nikhil",
  "Omkar", "Tejas", "Sahil", "Varun", "Diya", "Saanvi", "Kavya", "Priya", "Pooja", "Riya", "Tanvi", "Shruti", "Meghna",
  "Nandini", "Aditi", "Gauri", "Radhika", "Lavanya", "Simran", "Zoya", "Fatima", "Ayesha", "Imran", "Tenzin", "Joel",
  "Anjali", "Bhavna", "Divya", "Harini", "Keerthana", "Swati", "Aishwarya", "Jaspreet", "Gurleen", "Abhishek", "Ritika",
] as const;
const LAST = [
  "Deshpande", "Joshi", "Shinde", "Pawar", "Jadhav", "Iyer", "Menon", "Reddy", "Rao", "Naidu", "Sharma", "Gupta",
  "Agarwal", "Singh", "Chauhan", "Yadav", "Mishra", "Pandey", "Chatterjee", "Mukherjee", "Das", "Bose", "Sen", "Khan",
  "Shaikh", "Ansari", "Fernandes", "Gill", "Sandhu", "Bhatt", "Mehta", "Thakur", "Saxena", "Kapoor", "Kamble", "Gaikwad",
] as const;

function emailFor(name: string, domain: string, used: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".");
  let email = `${base}@${domain}`;
  for (let n = 2; used.has(email); n++) email = `${base}${n}@${domain}`;
  used.add(email);
  return email;
}

// ---------- Institution setup ----------

type Department = { id: string; code: string; years: number };

async function createInstitution(
  spec: { name: string; slug: string; city: string; emailDomain: string },
  departments: { code: string; name: string; years: number }[],
  contacts: { label: string; phone: string; hours: string }[],
): Promise<{ id: string; departments: Department[] }> {
  const inst = await db.institution.create({ data: { ...spec, createdAt: now() } });
  await db.institutionConfiguration.create({
    data: {
      institutionId: inst.id,
      checkInCadence: "WEEKLY",
      minCohortSize: 10,
      careTeamHours: "Monday to Saturday, 9 am to 6 pm",
      crisisContacts: contacts as unknown as Prisma.InputJsonValue,
      urgentAckMinutes: 15,
      priorityAckHours: 24,
      monitorAckHours: 72,
      retentionMonths: 36,
      riskRules: DEFAULT_RULES as unknown as Prisma.InputJsonValue,
      riskRulesVersion: DEFAULT_RULES.version,
    },
  });
  const created: Department[] = [];
  for (const d of departments) {
    const row = await db.department.create({ data: { institutionId: inst.id, code: d.code, name: d.name } });
    created.push({ id: row.id, code: d.code, years: d.years });
  }
  return { id: inst.id, departments: created };
}

async function createProfessional(
  person: Person,
  p: { profession: Profession; qualifications: string; registrationBody: string; registrationNumber: string; specialisations: string[]; languages: string[]; bio: string; verified: boolean },
): Promise<void> {
  await db.professionalProfile.create({
    data: {
      userId: person.id,
      institutionId: person.institutionId!,
      profession: p.profession,
      qualifications: p.qualifications,
      registrationBody: p.registrationBody,
      registrationNumber: p.registrationNumber,
      verification: p.verified ? "VERIFIED" : "PENDING",
      verifiedAt: p.verified ? now() : null,
      specialisations: p.specialisations,
      languages: p.languages,
      feeInr: 0,
      bio: p.bio,
      offersVideo: true,
    },
  });
}

type Student = Person & {
  departmentCode: string;
  profile: { mood: number; stress: number; sleep: number; energy: number; social: number; pressure: number };
};

async function createStudent(
  institutionId: string,
  dept: Department,
  name: string,
  email: string,
  serial: number,
  opts: { locale?: Locale; isDemo?: boolean; year?: number } = {},
): Promise<Student> {
  const person = await createPerson({ institutionId, name, email, role: "STUDENT", locale: opts.locale, isDemo: opts.isDemo });
  const year = opts.year ?? 1 + Math.floor(rand() * dept.years);
  const admitted = 26 - year;
  await db.studentProfile.create({
    data: {
      userId: person.id,
      institutionId,
      departmentId: dept.id,
      studentNumber: `${dept.code}${admitted}${String(serial).padStart(3, "0")}`,
      academicYear: year,
      createdAt: now(),
    },
  });
  return {
    ...person,
    departmentCode: dept.code,
    profile: {
      mood: between(3.4, 4.2),
      stress: between(2.2, 3.1),
      sleep: between(3.0, 4.0),
      energy: between(3.0, 4.0),
      social: between(3.0, 4.2),
      pressure: between(2.6, 3.3),
    },
  };
}

// ---------- Activity helpers ----------

const NEUTRAL_NOTES = [
  "Assignments piling up this week.",
  "Missing home a bit.",
  "Better week overall.",
  "Lab submissions due on Friday.",
  "Hostel mess food has been bad, not sleeping well.",
  "Placement tests coming up soon.",
] as const;

/** Mid-semester exams three to one and a half weeks ago raise pressure across campus. */
const examWeek = (daysFromToday: number): number => (daysFromToday >= -24 && daysFromToday <= -10 ? 1 : 0);

function backgroundCheckIn(s: Student, daysFromToday: number): CheckInInput {
  const exam = examWeek(daysFromToday);
  const v = (mean: number) => (chance(0.05) ? null : around(mean));
  return {
    mood: v(s.profile.mood - exam * 0.3),
    stress: v(s.profile.stress + exam * 0.7),
    sleep: v(s.profile.sleep - exam * 0.4),
    energy: v(s.profile.energy),
    social: v(s.profile.social),
    academicPressure: v(s.profile.pressure + exam * 0.8),
    wantsToTalk: chance(0.015) ? "YES" : chance(0.2) ? "NOT_NOW" : "NO",
    note: chance(0.06) ? pick(NEUTRAL_NOTES) : null,
  };
}

function scaleCheckIn(m: number, s: number, sl: number, e: number, so: number, ap: number, note: string | null = null): CheckInInput {
  return { mood: m, stress: s, sleep: sl, energy: e, social: so, academicPressure: ap, wantsToTalk: "NO", note };
}

/** Item answers whose total lands near `target` (0-3 each). The PHQ-9 safety item stays 0. */
function answersFor(instrument: Instrument, target: number): number[] {
  const n = instrument === "PHQ9" ? 9 : 7;
  const answers = new Array<number>(n).fill(0);
  const editable = instrument === "PHQ9" ? n - 1 : n;
  let total = 0;
  for (let guard = 0; total < target && guard < 200; guard++) {
    const i = Math.floor(rand() * editable);
    if ((answers[i] ?? 0) < 3) {
      answers[i] = (answers[i] ?? 0) + 1;
      total += 1;
    }
  }
  return answers;
}

async function selfScreen(s: Student, instrument: Instrument, answers: number[], difficulty: number | null): Promise<void> {
  const id = await startSelfAssessment(actorOf(s), instrument);
  await submitAssessment(actorOf(s), id, answers, difficulty);
}

async function postMessage(institutionId: string, caseId: string, senderId: string, body: string, readAfterMinutes: number | null): Promise<void> {
  const t = now();
  const readAt = readAfterMinutes === null ? null : later(t, readAfterMinutes * MINUTE);
  await db.message.create({
    data: {
      institutionId,
      caseId,
      senderId,
      bodyCt: encryptField(body),
      createdAt: t,
      readAt: readAt && readAt.getTime() <= BASE.getTime() ? readAt : null,
    },
  });
}

async function refer(staff: Person, caseId: string, studentId: string, service: ReferralService, professionalId: string | null, reason: string): Promise<string> {
  const t = now();
  const r = await db.referral.create({
    data: {
      institutionId: staff.institutionId!,
      caseId,
      studentId,
      createdById: staff.id,
      service,
      professionalId,
      reasonCt: encryptField(reason),
      status: "CREATED",
      createdAt: t,
      updatedAt: t,
    },
  });
  await markMilestone(db, caseId, "REFERRED", staff.id, "Referral initiated");
  await notify(db, studentId, "referral_new", { institutionId: staff.institutionId, link: "/student/care" });
  await recordAudit(db, actorOf(staff), { action: "referral.create", entityType: "Referral", entityId: r.id, metadata: { service } });
  return r.id;
}

async function book(p: {
  institutionId: string;
  student: Person;
  professionalId: string;
  startsAt: Date;
  minutes?: number;
  mode?: ConsultationMode;
  referralId: string | null;
  caseId: string | null;
}): Promise<string> {
  const t = now();
  const minutes = p.minutes ?? 45;
  const mode = p.mode ?? "VIDEO";
  // Move to the next free hour if this professional already has a slot at that time.
  let startsAt = p.startsAt;
  for (let i = 0; i < 12 && (await db.availabilitySlot.findFirst({ where: { professionalId: p.professionalId, startsAt } })); i++) {
    startsAt = later(startsAt, HOUR);
  }
  const endsAt = later(startsAt, minutes * MINUTE);
  const slot = await db.availabilitySlot.create({
    data: { institutionId: p.institutionId, professionalId: p.professionalId, startsAt, endsAt, mode, status: "BOOKED" },
  });
  const appt = await db.appointment.create({
    data: {
      institutionId: p.institutionId,
      studentId: p.student.id,
      professionalId: p.professionalId,
      referralId: p.referralId,
      slotId: slot.id,
      startsAt,
      endsAt,
      mode,
      status: "BOOKED",
      createdAt: t,
    },
  });
  await db.availabilitySlot.update({ where: { id: slot.id }, data: { appointmentId: appt.id } });
  if (p.referralId) await db.referral.update({ where: { id: p.referralId }, data: { status: "BOOKED", updatedAt: t } });
  if (p.caseId) await markMilestone(db, p.caseId, "ARRANGED", null, "Student booked a consultation");
  await notify(db, p.student.id, "appointment_booked", { institutionId: p.institutionId, link: `/student/appointments/${appt.id}` });
  await notify(db, p.professionalId, "staff_appointment_booked", { institutionId: p.institutionId, link: `/clinician/appointments/${appt.id}` });
  await recordAudit(db, actorOf(p.student), { action: "appointment.book", entityType: "Appointment", entityId: appt.id });
  return appt.id;
}

async function completeVisit(
  apptId: string,
  clinician: Person,
  attended: boolean,
  note: string | null,
  followUp: { dueAt: Date; assignedTo: Person; kind: string } | null,
): Promise<void> {
  const appt = await db.appointment.findUniqueOrThrow({ where: { id: apptId }, include: { referral: true } });
  const t = now();
  await db.appointment.update({ where: { id: apptId }, data: { status: attended ? "COMPLETED" : "NO_SHOW" } });
  const consultation = await db.consultation.create({
    data: {
      appointmentId: apptId,
      institutionId: appt.institutionId,
      provider: "dev",
      roomName: `room-${randomToken(9)}`,
      status: "ENDED",
      clinicianJoinedAt: later(appt.startsAt, -2 * MINUTE),
      studentJoinedAt: attended ? later(appt.startsAt, MINUTE) : null,
      startedAt: attended ? later(appt.startsAt, MINUTE) : null,
      endedAt: attended ? appt.endsAt : later(appt.startsAt, 20 * MINUTE),
      recordingEnabled: false,
    },
  });
  if (appt.referralId) {
    await db.referral.update({ where: { id: appt.referralId }, data: { status: attended ? "ATTENDED" : "NOT_ATTENDED", updatedAt: t } });
  }
  const caseId = appt.referral?.caseId ?? null;
  if (caseId) {
    await markMilestone(db, caseId, "APPOINTMENT_UPDATED", clinician.id, attended ? "Consultation completed" : "Student did not attend the consultation");
  }
  if (attended && note) {
    await db.clinicalNote.create({
      data: {
        institutionId: appt.institutionId,
        studentId: appt.studentId,
        authorId: clinician.id,
        appointmentId: apptId,
        consultationId: consultation.id,
        kind: "CONSULTATION",
        bodyCt: encryptField(note),
        createdAt: t,
      },
    });
  }
  if (followUp && caseId) {
    await db.followUp.create({
      data: {
        institutionId: appt.institutionId,
        caseId,
        appointmentId: apptId,
        studentId: appt.studentId,
        assignedToId: followUp.assignedTo.id,
        kind: followUp.kind,
        dueAt: followUp.dueAt,
        createdById: clinician.id,
        createdAt: t,
      },
    });
    await markMilestone(db, caseId, "FOLLOW_UP_SCHEDULED", clinician.id, "Follow-up scheduled");
  }
  await recordAudit(db, actorOf(clinician), { action: "consultation.complete", entityType: "Appointment", entityId: apptId, metadata: { attended } });
}

async function finishFollowUps(caseId: string, staff: Person, outcome: string): Promise<void> {
  const due = await db.followUp.findMany({ where: { caseId, status: "SCHEDULED", dueAt: { lte: now() } } });
  for (const f of due) {
    await db.followUp.update({ where: { id: f.id }, data: { status: "DONE", completedAt: now(), outcomeCt: encryptField(outcome) } });
    await logCaseEvent(db, caseId, "FOLLOW_UP_DONE", "Follow-up completed", staff.id);
  }
}

// ---------- Simulated staff routine for background activity ----------

const REVIEW_NOTES: Record<"NO_ACTION_NEEDED" | "OUTREACH", readonly string[]> = {
  NO_ACTION_NEEDED: [
    "Pattern matches exam week. Spoke briefly after class; nothing further needed for now.",
    "Student is already in regular contact with their faculty mentor. Will keep an eye on check-ins.",
    "One difficult fortnight. The student says things have settled since.",
  ],
  OUTREACH: [
    "Sent a check-in message and offered a time this week.",
    "Reached out through the faculty mentor and offered a counselling slot.",
  ],
};

const OUTREACH_MESSAGES = [
  "Hi, this is the campus counselling team. Your recent check-ins suggest things have been heavy lately. Would you like to talk this week? You can reply here.",
  "Hello from the counselling centre. We noticed a few tough weeks in your check-ins. We are here if you want to talk, no pressure.",
] as const;

const STUDENT_REPLIES = [
  "Thanks for checking in. Exams have been a lot. A chat would help.",
  "I am okay, just tired. Maybe next week?",
  "Thank you. Can we talk on a call?",
] as const;

const OUTCOMES = [
  "Met twice. Coping better after exams and using the study plan we made. Back to regular check-ins.",
  "Student attended counselling and reports better sleep. No further action; will review check-ins.",
  "Referred care completed. Student feels supported and knows how to reach us again.",
] as const;

type Ctx = {
  institutionId: string;
  team: Person[];
  clinicians: Person[];
  scripted: Set<string>;
  plannedAlerts: Set<string>;
  plannedCases: Set<string>;
  people: Map<string, Person>;
};

function planAlertHandling(ctx: Ctx, a: { id: string; category: TriageCategory; createdAt: Date }): void {
  const staff = pick(ctx.team);
  const actor = actorOf(staff);
  const ackAfter = a.category === "PRIORITY" ? between(2, 16) * HOUR : between(8, 44) * HOUR;
  const ackAt = workingHours(later(a.createdAt, ackAfter));
  const reviewAt = later(ackAt, between(20, 110) * MINUTE);
  let decision: AlertDecision;
  let feedback: ReviewerFeedback;
  if (a.category === "PRIORITY") {
    decision = chance(0.8) ? "OUTREACH" : "NO_ACTION_NEEDED";
    feedback = decision === "OUTREACH" ? (chance(0.85) ? "APPROPRIATE" : "UNDER_TRIAGED") : "NOT_NEEDED";
  } else {
    decision = chance(0.55) ? "NO_ACTION_NEEDED" : "OUTREACH";
    feedback = decision === "OUTREACH" ? "APPROPRIATE" : chance(0.6) ? "NOT_NEEDED" : "APPROPRIATE";
  }
  const note = pick(REVIEW_NOTES[decision === "OUTREACH" ? "OUTREACH" : "NO_ACTION_NEEDED"]);
  schedule(ackAt, "acknowledge alert", () => soft(() => acknowledgeAlert(actor, a.id)));
  schedule(reviewAt, "review alert", async () => {
    await soft(() => reviewAlert(actor, a.id, { decision, feedback, note }));
    await planNewCases(ctx);
  });
  const closeAt = decision === "NO_ACTION_NEEDED" ? later(reviewAt, 5 * MINUTE) : workingHours(later(reviewAt, between(1, 3) * DAY));
  schedule(closeAt, "close alert", () => soft(() => closeAlert(actor, a.id)));
}

async function planNewAlerts(ctx: Ctx): Promise<void> {
  const open = await db.alert.findMany({
    where: { institutionId: ctx.institutionId, status: "NEW" },
    select: { id: true, studentId: true, category: true, createdAt: true },
  });
  for (const a of open) {
    const key = `${a.id}:${a.category}`;
    if (ctx.plannedAlerts.has(key) || ctx.scripted.has(a.studentId) || a.category === "URGENT") continue;
    ctx.plannedAlerts.add(key);
    planAlertHandling(ctx, a);
  }
}

async function planNewCases(ctx: Ctx): Promise<void> {
  const cases = await db.case.findMany({
    where: { institutionId: ctx.institutionId, status: { in: ["OPEN", "ACTIVE"] } },
    select: { id: true, studentId: true, openedAt: true },
  });
  for (const c of cases) {
    if (ctx.plannedCases.has(c.id) || ctx.scripted.has(c.studentId)) continue;
    ctx.plannedCases.add(c.id);
    const staff = pick(ctx.team);
    const actor = actorOf(staff);
    const student = ctx.people.get(c.studentId);
    const contactAt = workingHours(later(c.openedAt, between(3, 26) * HOUR));
    schedule(contactAt, "contact student", async () => {
      await soft(() => assignCase(actor, c.id, staff.id));
      await postMessage(ctx.institutionId, c.id, staff.id, pick(OUTREACH_MESSAGES), between(30, 600));
      await soft(() => recordCaseAction(actor, c.id, "CONTACTED"));
    });
    if (student) {
      schedule(later(contactAt, between(2, 20) * HOUR), "student reply", () =>
        postMessage(ctx.institutionId, c.id, student.id, pick(STUDENT_REPLIES), between(20, 300)),
      );
    }
    let lastStep = contactAt;
    const willRefer = ctx.clinicians.length > 0 && chance(0.45) && !!student;
    if (willRefer && student) {
      const clinician = pick(ctx.clinicians);
      const referAt = workingHours(later(contactAt, between(1, 2) * DAY));
      const apptAt = workingHours(istToUtc(isoDay(later(referAt, between(2, 5) * DAY)), pick(["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"])));
      const attended = chance(0.8);
      let referralId: string | null = null;
      let apptId: string | null = null;
      schedule(referAt, "refer", async () => {
        referralId = await refer(staff, c.id, student.id, "CLINICAL_PSYCHOLOGY", clinician.id, "Ongoing stress and low mood over several weeks. Student would like to talk to someone.");
      });
      schedule(later(referAt, between(3, 20) * HOUR), "book", async () => {
        if (!referralId || apptAt.getTime() <= now().getTime()) return;
        apptId = await book({ institutionId: ctx.institutionId, student, professionalId: clinician.id, startsAt: apptAt, referralId, caseId: c.id });
      });
      schedule(later(apptAt, 50 * MINUTE), "consultation", async () => {
        if (!apptId) return;
        const id = apptId;
        const run = () =>
          completeVisit(
            id,
            clinician,
            attended,
            attended ? "Initial consultation. Discussed exam stress and sleep routine. Agreed on a weekly plan and a review." : null,
            attended ? { dueAt: workingHours(later(apptAt, 7 * DAY)), assignedTo: staff, kind: "CHECK_IN" } : null,
          );
        // The booking may have moved to a later free hour.
        const appt = await db.appointment.findUnique({ where: { id }, select: { endsAt: true } });
        if (appt && appt.endsAt.getTime() > now().getTime()) {
          schedule(later(appt.endsAt, 5 * MINUTE), "consultation (moved)", run);
          return;
        }
        await run();
      });
      lastStep = later(apptAt, 8 * DAY);
    }
    if (chance(0.8)) {
      const closeAt = workingHours(later(lastStep, between(1, 3) * DAY));
      schedule(closeAt, "close case", async () => {
        await finishFollowUps(c.id, staff, "Checked in. Doing better.");
        await soft(() => documentOutcome(actor, c.id, pick(OUTCOMES)));
        await soft(() => closeCase(actor, c.id));
      });
    }
  }
}

/** A background student's weekly or twice-weekly rhythm over the replay window. */
function scheduleBackground(ctx: Ctx, s: Student, pattern: "regular" | "frequent" | "sporadic" | "inactive"): void {
  if (pattern === "inactive") return;
  const weekday = Math.floor(rand() * 7);
  const evening = `${String(19 + Math.floor(rand() * 4)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;
  for (let d = -55; d <= 0; d++) {
    const dow = new Date(dayAt(d, "12:00").getTime() + 330 * MINUTE).getUTCDay();
    const due = pattern === "frequent" ? dow === weekday || dow === (weekday + 3) % 7 : dow === weekday;
    if (!due) continue;
    const p = pattern === "sporadic" ? 0.4 : 0.85;
    if (!chance(p)) continue;
    const day = d;
    schedule(dayAt(d, evening), "background check-in", async () => {
      await soft(() => submitCheckIn(actorOf(s), backgroundCheckIn(s, day)));
      await planNewAlerts(ctx);
      await planNewCases(ctx);
    });
  }
  if (chance(0.4)) {
    schedule(dayAt(-36 + Math.floor(rand() * 6), "18:30"), "PHQ-9", async () => {
      await soft(() => selfScreen(s, "PHQ9", answersFor("PHQ9", Math.floor(between(1, 9))), 0));
      await planNewAlerts(ctx);
    });
  }
  if (chance(0.3)) {
    schedule(dayAt(-15 + Math.floor(rand() * 8), "19:00"), "GAD-7", async () => {
      await soft(() => selfScreen(s, "GAD7", answersFor("GAD7", Math.floor(between(1, 9))), 0));
      await planNewAlerts(ctx);
    });
  }
}

// ---------- Main ----------

export async function seed(): Promise<void> {
  const existing = await db.institution.count();
  if (existing > 0) {
    console.log("[seed] Database already has data; skipping. Run `npm run db:reset` for a fresh copy.");
    return;
  }
  setClock(null);
  BASE = now();
  setClock(dayAt(-70, "09:00"));

  // ----- Sahyadri Institute of Technology (demo tenant) -----
  const sahyadri = await createInstitution(
    DEMO_INSTITUTION,
    [
      { code: "CE", name: "Computer Engineering", years: 4 },
      { code: "IT", name: "Information Technology", years: 4 },
      { code: "ENTC", name: "Electronics and Telecommunication", years: 4 },
      { code: "ME", name: "Mechanical Engineering", years: 4 },
      { code: "CIV", name: "Civil Engineering", years: 4 },
      { code: "ARCH", name: "Architecture", years: 5 },
    ],
    [
      { label: "Campus counselling centre (demo number)", phone: "+91 20 0000 1010", hours: "Monday to Saturday, 9 am to 6 pm" },
      { label: "Campus security desk (demo number)", phone: "+91 20 0000 1100", hours: "24x7" },
    ],
  );
  const inst = sahyadri.id;
  const dept = (code: string) => sahyadri.departments.find((d) => d.code === code)!;
  const used = new Set<string>();
  const persona = (key: string) => DEMO_PERSONAS.find((p) => p.key === key)!;

  const meera = await createPerson({ institutionId: inst, name: persona("counsellor").name, email: persona("counsellor").email, role: "COUNSELLOR", isDemo: true });
  const farhan = await createPerson({ institutionId: inst, name: "Farhan Qureshi", email: "farhan.qureshi@sahyadri.example", role: "COUNSELLOR" });
  const rohan = await createPerson({ institutionId: inst, name: persona("clinician").name, email: persona("clinician").email, role: "CLINICIAN", isDemo: true });
  const kavita = await createPerson({ institutionId: inst, name: "Dr Kavita Menon", email: "kavita.menon@sahyadri.example", role: "CLINICIAN" });
  const poojaB = await createPerson({ institutionId: inst, name: "Pooja Bhatt", email: "pooja.bhatt@sahyadri.example", role: "CLINICIAN" });
  const sameer = await createPerson({ institutionId: inst, name: "Dr Sameer Joshi", email: "sameer.joshi@sahyadri.example", role: "CLINICIAN" });
  await createPerson({ institutionId: inst, name: persona("admin").name, email: persona("admin").email, role: "INSTITUTION_ADMIN", isDemo: true });
  await createPerson({ institutionId: null, name: persona("platform").name, email: persona("platform").email, role: "PLATFORM_ADMIN", isDemo: true });
  // Staff addresses are taken, so generated student names can never collide with them.
  for (const email of await db.user.findMany({ select: { email: true } })) used.add(email.email);

  await createProfessional(rohan, {
    profession: "CLINICAL_PSYCHOLOGIST",
    qualifications: "M.Phil. Clinical Psychology",
    registrationBody: "Rehabilitation Council of India",
    registrationNumber: "A-40217 (demo)",
    specialisations: ["Anxiety", "Academic stress", "Sleep"],
    languages: ["English", "Hindi", "Marathi"],
    bio: "Works with students on stress, anxiety and sleep using CBT-based approaches.",
    verified: true,
  });
  await createProfessional(kavita, {
    profession: "PSYCHIATRIST",
    qualifications: "MD Psychiatry",
    registrationBody: "National Medical Commission",
    registrationNumber: "MH-2011-0457 (demo)",
    specialisations: ["Mood disorders", "Crisis care"],
    languages: ["English", "Hindi", "Malayalam"],
    bio: "Consultant psychiatrist for the campus health centre two days a week.",
    verified: true,
  });
  await createProfessional(poojaB, {
    profession: "COUNSELLING_PSYCHOLOGIST",
    qualifications: "M.A. Counselling Psychology",
    registrationBody: "Rehabilitation Council of India",
    registrationNumber: "A-51893 (demo)",
    specialisations: ["Adjustment", "Relationships", "First-year transition"],
    languages: ["English", "Hindi", "Gujarati"],
    bio: "Supports students settling into hostel life and their first year.",
    verified: true,
  });
  await createProfessional(sameer, {
    profession: "CLINICAL_PSYCHOLOGIST",
    qualifications: "Psy.D.",
    registrationBody: "Rehabilitation Council of India",
    registrationNumber: "A-62004 (demo)",
    specialisations: ["Trauma"],
    languages: ["English", "Marathi"],
    bio: "Joining the campus team this term. Registration check in progress.",
    verified: false,
  });
  await db.institutionConfiguration.update({ where: { institutionId: inst }, data: { onCallResponderId: meera.id } });
  await db.inviteCode.create({
    data: { code: "SAHYADRI-2026", institutionId: inst, role: "STUDENT", expiresAt: later(BASE, 90 * DAY), maxUses: 500, createdAt: now() },
  });

  // Students: department sizes chosen so small groups are visibly suppressed (k = 10).
  const sizes: [string, number][] = [["CE", 38], ["IT", 30], ["ENTC", 24], ["ME", 26], ["CIV", 12], ["ARCH", 6]];
  const students: Student[] = [];
  const people = new Map<string, Person>();
  const named = async (code: string, name: string, opts: { locale?: Locale; isDemo?: boolean; year?: number; email?: string } = {}) => {
    const s = await createStudent(inst, dept(code), name, opts.email ?? emailFor(name, DEMO_INSTITUTION.emailDomain, used), students.length + 1, opts);
    students.push(s);
    people.set(s.id, s);
    return s;
  };
  const aanya = await named("CE", persona("student").name, { isDemo: true, year: 2, email: persona("student").email });
  const rahul = await named("IT", "Rahul Verma", { locale: "hi", year: 3 });
  const ishita = await named("ENTC", "Ishita Banerjee", { year: 1 });
  const sneha = await named("CE", "Sneha Patil", { year: 3 });
  const faizan = await named("CIV", "Mohammed Faizan", { locale: "hi", year: 2 });
  const remaining = new Map(sizes.map(([code, n]) => [code, n - students.filter((s) => s.departmentCode === code).length]));
  let nameIndex = 0;
  for (const [code, n] of remaining) {
    for (let i = 0; i < n; i++) {
      const name = `${FIRST[(nameIndex * 7) % FIRST.length]} ${LAST[(nameIndex * 11) % LAST.length]}`;
      nameIndex += 1;
      await named(code, name, { locale: chance(0.25) ? "hi" : "en" });
    }
  }

  const ctx: Ctx = {
    institutionId: inst,
    team: [meera, farhan],
    clinicians: [rohan, poojaB],
    scripted: new Set([aanya.id, rahul.id, ishita.id, sneha.id, faizan.id]),
    plannedAlerts: new Set(),
    plannedCases: new Set(),
    people,
  };

  // Consent at onboarding. Most students allow care-team review and anonymous statistics.
  for (const s of students) {
    const onboarded = later(dayAt(-62, "10:00"), Math.floor(between(0, 8)) * DAY + Math.floor(between(0, 600)) * MINUTE);
    const story = ctx.scripted.has(s.id);
    const neverOnboarded = !story && chance(0.07);
    if (neverOnboarded) continue;
    const careTeam = s.id === faizan.id ? false : story ? true : chance(0.8);
    const aggregate = story ? true : chance(0.85);
    schedule(onboarded, "onboarding consent", () =>
      recordConsentChoices(actorOf(s), { CORE_PROCESSING: true, CARE_TEAM_REVIEW: careTeam, AGGREGATE_ANALYTICS: aggregate }, "onboarding", s.locale).then(() => undefined),
    );
    if (!story) {
      const r = rand();
      scheduleBackground(ctx, s, r < 0.5 ? "regular" : r < 0.65 ? "frequent" : r < 0.88 ? "sporadic" : "inactive");
    }
  }

  // Story: Aanya. Rising academic pressure and falling sleep over eight weeks.
  const aanyaWeeks: CheckInInput[] = [
    scaleCheckIn(4, 2, 4, 4, 4, 3),
    scaleCheckIn(4, 2, 4, 4, 4, 3),
    scaleCheckIn(3, 3, 3, 3, 4, 3),
    scaleCheckIn(3, 3, 3, 3, 3, 4, "Midsem syllabus is huge this time."),
    scaleCheckIn(3, 4, 2, 3, 3, 4),
    scaleCheckIn(2, 4, 2, 2, 3, 5, "Barely sleeping before the DSA exam."),
    scaleCheckIn(2, 5, 2, 2, 2, 5),
    scaleCheckIn(2, 4, 2, 2, 2, 4),
  ];
  aanyaWeeks.forEach((input, i) => {
    schedule(dayAt(-52 + i * 7, "21:00"), "Aanya check-in", () => submitCheckIn(actorOf(aanya), input).then(() => undefined));
  });
  const aanyaAlert = async () =>
    db.alert.findFirst({ where: { studentId: aanya.id, status: { not: "CLOSED" } }, orderBy: { createdAt: "desc" } });
  schedule(dayAt(-16, "10:20"), "Meera acknowledges Aanya", async () => {
    const a = await aanyaAlert();
    if (a) await acknowledgeAlert(actorOf(meera), a.id);
  });
  schedule(dayAt(-16, "10:45"), "Meera reviews Aanya", async () => {
    const a = await aanyaAlert();
    if (!a) return;
    const { caseId } = await reviewAlert(actorOf(meera), a.id, {
      decision: "FURTHER_ASSESSMENT",
      feedback: "APPROPRIATE",
      note: "Steady rise in academic pressure with falling sleep across four check-ins. Asked for a PHQ-9 and sent a message.",
    });
    await requestAssessment(actorOf(meera), aanya.id, "PHQ9", a.id);
    if (caseId) {
      setClock(later(now(), 5 * MINUTE));
      await postMessage(inst, caseId, meera.id, "Hi Aanya, this is Meera from the counselling centre. Your recent check-ins suggest the last few weeks have been heavy. Would you like to talk this week? You can reply here or book a time.", 480);
      await recordCaseAction(actorOf(meera), caseId, "CONTACTED");
    }
  });
  schedule(dayAt(-15, "18:30"), "Aanya replies", async () => {
    const c = await db.case.findFirst({ where: { studentId: aanya.id, status: { not: "CLOSED" } } });
    if (c) await postMessage(inst, c.id, aanya.id, "Thanks Meera. Midsems are a lot right now. I can do the questionnaire this week.", 900);
  });
  schedule(dayAt(-8, "19:30"), "Aanya completes PHQ-9", async () => {
    const a = await db.assessment.findFirst({ where: { studentId: aanya.id, status: "ASSIGNED", instrument: "PHQ9" } });
    if (a) await submitAssessment(actorOf(aanya), a.id, [2, 2, 2, 2, 1, 2, 1, 0, 0], 1);
  });
  schedule(dayAt(-7, "09:40"), "Meera acknowledges raised alert", async () => {
    const a = await aanyaAlert();
    if (a?.status === "NEW") await acknowledgeAlert(actorOf(meera), a.id);
  });
  schedule(dayAt(-7, "11:05"), "Meera refers Aanya", async () => {
    const a = await aanyaAlert();
    if (!a) return;
    const { caseId } = await reviewAlert(actorOf(meera), a.id, {
      decision: "REFERRAL",
      feedback: "APPROPRIATE",
      note: "PHQ-9 in the moderate range alongside four weeks of rising pressure and poor sleep. Offered a consultation with Dr Desai and Aanya agreed.",
    });
    if (caseId) {
      await refer(meera, caseId, aanya.id, "CLINICAL_PSYCHOLOGY", rohan.id, "Four weeks of rising academic pressure and poor sleep; PHQ-9 in the moderate range. Student agreed to a consultation.");
      await postMessage(inst, caseId, meera.id, "I have suggested a session with Dr Rohan Desai. You can pick a time that suits you under Care.", null);
    }
  });

  // Story: Rahul. A positive PHQ-9 safety answer, handled the same afternoon.
  for (const [i, d] of [-20, -13, -6].entries()) {
    schedule(dayAt(d, "22:10"), "Rahul check-in", () =>
      submitCheckIn(actorOf(rahul), scaleCheckIn(3 - (i > 1 ? 1 : 0), 3 + i, 3 - i, 3, 3, 4)).then(() => undefined),
    );
  }
  schedule(dayAt(-5, "16:40"), "Rahul PHQ-9", () => selfScreen(rahul, "PHQ9", [2, 2, 3, 2, 1, 2, 2, 1, 1], 2));
  const rahulAlert = async () => db.alert.findFirst({ where: { studentId: rahul.id }, orderBy: { createdAt: "desc" } });
  schedule(dayAt(-5, "16:49"), "Meera acknowledges Rahul", async () => {
    const a = await rahulAlert();
    if (a) await acknowledgeAlert(actorOf(meera), a.id);
  });
  schedule(dayAt(-5, "16:58"), "Meera calls Rahul", async () => {
    const a = await rahulAlert();
    if (!a) return;
    await recordEscalationAttempt(actorOf(meera), a.id, {
      target: "STUDENT",
      channel: "PHONE",
      outcome: "REACHED",
      note: "Spoke with Rahul. He is safe tonight and staying with his roommate. Agreed to see the psychiatrist tomorrow and has the Tele-MANAS number.",
    });
  });
  schedule(dayAt(-5, "17:20"), "Meera reviews Rahul", async () => {
    const a = await rahulAlert();
    if (!a) return;
    const { caseId } = await reviewAlert(actorOf(meera), a.id, {
      decision: "CRISIS_PROTOCOL",
      feedback: "APPROPRIATE",
      note: "Positive answer to PHQ-9 question 9 with a score in the moderately severe range. Crisis protocol followed: student reached by phone, safety plan agreed, psychiatry consultation booked for tomorrow.",
    });
    if (!caseId) return;
    const referralId = await refer(meera, caseId, rahul.id, "PSYCHIATRY", kavita.id, "Positive PHQ-9 safety answer, moderately severe score. Seen by phone the same afternoon; needs psychiatric assessment.");
    setClock(later(now(), 10 * MINUTE));
    await book({ institutionId: inst, student: rahul, professionalId: kavita.id, startsAt: dayAt(-4, "11:00"), referralId, caseId });
  });
  schedule(dayAt(-4, "11:50"), "Rahul consultation", async () => {
    const appt = await db.appointment.findFirst({ where: { studentId: rahul.id }, orderBy: { startsAt: "desc" } });
    if (!appt) return;
    await completeVisit(appt.id, kavita, true, "Initial psychiatric consultation. Safety plan reviewed and agreed with the student. Sleep and exam stress discussed. Review in one week.", {
      dueAt: dayAt(2, "10:00"),
      assignedTo: meera,
      kind: "CHECK_IN",
    });
  });
  schedule(dayAt(-4, "12:30"), "Meera closes Rahul's alert", async () => {
    const a = await rahulAlert();
    if (a) await closeAlert(actorOf(meera), a.id);
  });
  schedule(dayAt(-4, "13:00"), "Meera messages Rahul", async () => {
    const c = await db.case.findFirst({ where: { studentId: rahul.id, status: { not: "CLOSED" } } });
    if (c) await postMessage(inst, c.id, meera.id, "Rahul, thank you for talking with us. I will check in with you in a few days. If things feel worse before then, call Tele-MANAS on 14416, or 112 in an emergency.", 95);
  });

  // Story: Sneha. A severe GAD-7 score, outreach and an upcoming session.
  schedule(dayAt(-6, "20:15"), "Sneha GAD-7", () => selfScreen(sneha, "GAD7", [3, 3, 2, 2, 2, 2, 2], 2));
  const snehaAlert = async () => db.alert.findFirst({ where: { studentId: sneha.id }, orderBy: { createdAt: "desc" } });
  schedule(dayAt(-5, "11:10"), "Farhan acknowledges Sneha", async () => {
    const a = await snehaAlert();
    if (a) await acknowledgeAlert(actorOf(farhan), a.id);
  });
  schedule(dayAt(-5, "11:35"), "Farhan reviews Sneha", async () => {
    const a = await snehaAlert();
    if (!a) return;
    const { caseId } = await reviewAlert(actorOf(farhan), a.id, {
      decision: "OUTREACH",
      feedback: "APPROPRIATE",
      note: "GAD-7 in the severe range on a self-started screen. Messaged to offer support.",
    });
    if (!caseId) return;
    await postMessage(inst, caseId, farhan.id, "Hi Sneha, I am Farhan from the counselling team. Thank you for doing the questionnaire. Would a conversation with one of our psychologists help?", 140);
    await recordCaseAction(actorOf(farhan), caseId, "CONTACTED");
  });
  const snehaCase = async () => db.case.findFirst({ where: { studentId: sneha.id, status: { not: "CLOSED" } } });
  schedule(dayAt(-5, "15:35"), "Sneha replies", async () => {
    const c = await snehaCase();
    if (c) await postMessage(inst, c.id, sneha.id, "Yes please. Something online would be easier for me.", 60);
  });
  schedule(dayAt(-5, "16:40"), "Farhan refers Sneha", async () => {
    const c = await snehaCase();
    if (!c) return;
    await refer(farhan, c.id, sneha.id, "CLINICAL_PSYCHOLOGY", poojaB.id, "Severe GAD-7 score; prefers an online session.");
  });
  schedule(dayAt(-5, "17:10"), "Sneha books", async () => {
    const r = await db.referral.findFirst({ where: { studentId: sneha.id, status: "CREATED" } });
    if (r) await book({ institutionId: inst, student: sneha, professionalId: poojaB.id, startsAt: dayAt(2, "11:00"), referralId: r.id, caseId: r.caseId });
  });

  // Story: Ishita. An urgent help request that nobody has acknowledged yet.
  for (const d of [-30, -23, -16, -9]) {
    schedule(dayAt(d, "21:30"), "Ishita check-in", () => submitCheckIn(actorOf(ishita), scaleCheckIn(3, 3, 3, 3, 3, 3)).then(() => undefined));
  }
  schedule(minutesAgo(38), "Ishita asks for urgent support", () =>
    requestHelp(actorOf(ishita), {
      type: "URGENT_SUPPORT" as HelpRequestType,
      details: "Things feel really heavy today and I do not want to be alone right now.",
      origin: "help_form",
    }).then(() => undefined),
  );
  schedule(minutesAgo(20), "Scheduled tick", () => escalateOverdueUrgentAlerts(inst).then(() => undefined));

  // Story: Faizan. No care-team review consent, so his check-ins never raise alerts; he asks
  // for help himself and the case is handled and closed.
  for (const d of [-40, -33, -26, -19]) {
    schedule(dayAt(d, "20:40"), "Faizan check-in", () => submitCheckIn(actorOf(faizan), scaleCheckIn(3, 5, 2, 3, 3, 5)).then(() => undefined));
  }
  schedule(dayAt(-19, "21:05"), "Faizan asks for help", () =>
    requestHelp(actorOf(faizan), { type: "ACADEMIC_STRESS", details: "Backlogs from last semester and the midsem schedule clash.", origin: "help_form" }).then(() => undefined),
  );
  const faizanCase = async () => db.case.findFirst({ where: { studentId: faizan.id }, orderBy: { openedAt: "desc" } });
  schedule(dayAt(-18, "10:05"), "Farhan picks up Faizan's case", async () => {
    const c = await faizanCase();
    if (!c) return;
    await assignCase(actorOf(farhan), c.id, farhan.id);
    await postMessage(inst, c.id, farhan.id, "Hi Faizan, Farhan here from counselling. Can you come by the centre tomorrow at 4? We can look at the exam schedule together.", 70);
    await recordCaseAction(actorOf(farhan), c.id, "CONTACTED");
  });
  schedule(dayAt(-12, "16:30"), "Farhan documents Faizan's outcome", async () => {
    const c = await faizanCase();
    if (!c) return;
    await documentOutcome(actorOf(farhan), c.id, "Met twice. Helped him request a revised exam schedule through the academic office. Coping well and knows how to reach us.");
    await closeCase(actorOf(farhan), c.id);
  });

  const steps = await drain();

  // Future availability for the next two weeks (Monday to Saturday).
  setClock(BASE);
  for (const clinician of [rohan, kavita, poojaB]) {
    const slots: Prisma.AvailabilitySlotCreateManyInput[] = [];
    for (let d = 1; d <= 14; d++) {
      const dow = new Date(dayAt(d, "12:00").getTime() + 330 * MINUTE).getUTCDay();
      if (dow === 0 || (clinician.id === kavita.id && dow !== 2 && dow !== 4)) continue;
      for (const hhmm of ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00"]) {
        const startsAt = dayAt(d, hhmm);
        slots.push({ institutionId: inst, professionalId: clinician.id, startsAt, endsAt: later(startsAt, 45 * MINUTE), mode: hhmm === "16:00" ? "IN_PERSON" : "VIDEO", status: "OPEN" });
      }
    }
    await db.availabilitySlot.createMany({ data: slots, skipDuplicates: true });
  }

  // A few students book upcoming sessions through the real booking service, so the clinician
  // schedules show the booked state alongside open availability.
  const consenting = await db.consentRecord.findMany({
    where: { institutionId: inst, scope: "CORE_PROCESSING", decision: "GRANTED" },
    select: { userId: true },
  });
  const consentingIds = new Set(consenting.map((c) => c.userId));
  const bookers = students.filter((s) => !ctx.scripted.has(s.id) && consentingIds.has(s.id)).slice(0, 4);
  for (const [i, s] of bookers.entries()) {
    const clinician = i % 2 === 0 ? rohan : poojaB;
    const slot = await db.availabilitySlot.findFirst({
      where: { professionalId: clinician.id, status: "OPEN", startsAt: { gte: dayAt(1 + i, "00:00") } },
      orderBy: { startsAt: "asc" },
    });
    if (!slot) continue;
    setClock(minutesAgo(240 - i * 45));
    await soft(() => bookAppointment(actorOf(s), { slotId: slot.id }));
  }
  setClock(BASE);

  // Older notifications have been read; recent ones stay unread.
  await db.notification.updateMany({ where: { createdAt: { lt: later(BASE, -2 * DAY) }, readAt: null }, data: { readAt: later(BASE, -2 * DAY) } });

  // ----- Narmada University (second tenant, used to show isolation) -----
  setClock(dayAt(-70, "09:00"));
  const narmada = await createInstitution(
    SECOND_INSTITUTION,
    [
      { code: "CSE", name: "Computer Science and Engineering", years: 4 },
      { code: "MBA", name: "Management Studies", years: 2 },
    ],
    [{ label: "Student wellness cell (demo number)", phone: "+91 731 000 2020", hours: "Monday to Friday, 10 am to 5 pm" }],
  );
  const devika = await createPerson({ institutionId: narmada.id, name: "Devika Malhotra", email: "devika.malhotra@narmada.example", role: "COUNSELLOR" });
  await createPerson({ institutionId: narmada.id, name: "Harish Tiwari", email: "harish.tiwari@narmada.example", role: "INSTITUTION_ADMIN" });
  await db.institutionConfiguration.update({ where: { institutionId: narmada.id }, data: { onCallResponderId: devika.id } });
  const narmadaUsed = new Set<string>();
  const ctx2: Ctx = { institutionId: narmada.id, team: [devika], clinicians: [], scripted: new Set(), plannedAlerts: new Set(), plannedCases: new Set(), people: new Map() };
  for (let i = 0; i < 12; i++) {
    const d = narmada.departments[i % 2]!;
    const name = `${FIRST[(i * 5 + 3) % FIRST.length]} ${LAST[(i * 13 + 5) % LAST.length]}`;
    const s = await createStudent(narmada.id, d, name, emailFor(name, SECOND_INSTITUTION.emailDomain, narmadaUsed), i + 1, { locale: chance(0.5) ? "hi" : "en" });
    ctx2.people.set(s.id, s);
    schedule(dayAt(-60, "11:00"), "onboarding consent", () =>
      recordConsentChoices(actorOf(s), { CORE_PROCESSING: true, CARE_TEAM_REVIEW: true, AGGREGATE_ANALYTICS: true }, "onboarding", s.locale).then(() => undefined),
    );
    scheduleBackground(ctx2, s, i % 4 === 0 ? "frequent" : "regular");
  }
  const steps2 = await drain();

  setClock(null);
  const counts = await Promise.all([
    db.user.count({ where: { role: "STUDENT" } }),
    db.checkIn.count(),
    db.assessment.count({ where: { status: "COMPLETED" } }),
    db.alert.count(),
    db.alert.count({ where: { status: { not: "CLOSED" } } }),
    db.case.count(),
    db.appointment.count(),
    db.auditLog.count(),
  ]);
  console.log(
    `[seed] replayed ${steps + steps2} steps: ${counts[0]} students, ${counts[1]} check-ins, ${counts[2]} questionnaires, ` +
      `${counts[3]} alerts (${counts[4]} open), ${counts[5]} cases, ${counts[6]} appointments, ${counts[7]} audit entries.`,
  );
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (invokedDirectly) {
  seed()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
