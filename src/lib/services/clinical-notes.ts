import type { UserActor } from "@/lib/actor";
import { recordAudit } from "@/lib/audit";
import { assertCan, isPlatformAdminInstitutionContext, tenantOf } from "@/lib/auth/permissions";
import { now } from "@/lib/clock";
import { decryptField, encryptField } from "@/lib/crypto";
import { db, runTx } from "@/lib/db";
import { fail } from "@/lib/errors";

export const NOTE_KINDS = ["CONSULTATION", "ASSESSMENT", "RECOMMENDATION", "REFERRAL"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  CONSULTATION: "Consultation note",
  ASSESSMENT: "Assessment",
  RECOMMENDATION: "Recommendation",
  REFERRAL: "Referral",
};

const MAX_NOTE_LENGTH = 8000;

/** Writes a clinical note for one of the clinician's own appointments. The body is encrypted. */
export async function addClinicalNote(
  actor: UserActor,
  input: { appointmentId: string; kind: NoteKind; body: string },
): Promise<{ noteId: string }> {
  assertCan(actor, "clinical_note.write");
  const institutionId = tenantOf(actor);
  if (!(NOTE_KINDS as readonly string[]).includes(input.kind)) fail("VALIDATION", "Choose a note type from the list.");
  const body = input.body.trim();
  if (body.length < 3) fail("VALIDATION", "Write the note first.");
  if (body.length > MAX_NOTE_LENGTH) fail("VALIDATION", `Keep the note under ${MAX_NOTE_LENGTH} characters.`);

  return runTx(async (tx) => {
    const appt = await tx.appointment.findFirst({
      where: {
        id: input.appointmentId,
        institutionId,
        ...(isPlatformAdminInstitutionContext(actor) ? {} : { professionalId: actor.userId }),
      },
      select: { id: true, studentId: true, consultation: { select: { id: true } } },
    });
    if (!appt) fail("NOT_FOUND", "Appointment not found.");
    const note = await tx.clinicalNote.create({
      data: {
        institutionId,
        studentId: appt.studentId,
        authorId: actor.userId,
        appointmentId: appt.id,
        consultationId: appt.consultation?.id ?? null,
        kind: input.kind,
        bodyCt: encryptField(body),
        createdAt: now(),
      },
    });
    await recordAudit(tx, actor, {
      action: "clinical_note.write",
      entityType: "ClinicalNote",
      entityId: note.id,
      metadata: { studentId: appt.studentId, kind: input.kind },
    });
    return { noteId: note.id };
  });
}

/**
 * Clinical notes for a student, readable only by a clinician who wrote a note for the student or
 * has or had an appointment with them. Every read is audited with ids and a count, never content.
 */
export async function listClinicalNotes(actor: UserActor, studentId: string) {
  assertCan(actor, "clinical_note.read");
  const institutionId = tenantOf(actor);
  if (!isPlatformAdminInstitutionContext(actor)) {
    const wrote = await db.clinicalNote.findFirst({ where: { institutionId, studentId, authorId: actor.userId }, select: { id: true } });
    if (!wrote) {
      const met = await db.appointment.findFirst({ where: { institutionId, studentId, professionalId: actor.userId }, select: { id: true } });
      if (!met) fail("FORBIDDEN", "You can read clinical notes only for students you have an appointment with.");
    }
  }
  const rows = await db.clinicalNote.findMany({
    where: { institutionId, studentId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const authors = await db.user.findMany({ where: { id: { in: authorIds }, institutionId }, select: { id: true, name: true } });
  const nameById = new Map(authors.map((a) => [a.id, a.name]));
  await recordAudit(db, actor, {
    action: "clinical_note.read",
    entityType: "ClinicalNote",
    metadata: { studentId, count: rows.length },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    appointmentId: r.appointmentId,
    authorId: r.authorId,
    authorName: nameById.get(r.authorId) ?? "Clinician",
    createdAt: r.createdAt,
    body: decryptField(r.bodyCt),
  }));
}
