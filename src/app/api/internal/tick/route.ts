import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { db } from "@/lib/db";
import { notifyDueFollowUps } from "@/lib/services/followups";
import { escalateOverdueUrgentAlerts } from "@/lib/services/risk";
import { sendAppointmentReminders } from "@/lib/services/scheduling";

/**
 * Scheduled work: re-escalates urgent alerts nobody has acknowledged, and sends follow-up and
 * appointment reminders. Call every 5 minutes from a scheduler with
 * `Authorization: Bearer $CRON_SECRET`. Nothing here closes, lowers or resolves anything.
 */
export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const at = now();
  const institutions = await db.institution.findMany({ select: { id: true } });
  const results: { institutionId: string; escalated: number; followUps: number; reminders: number; error?: string }[] = [];
  for (const { id } of institutions) {
    // One institution's failure must not stop the others from being processed.
    try {
      const escalated = await escalateOverdueUrgentAlerts(id, at);
      const followUps = await notifyDueFollowUps(id, at);
      const reminders = await sendAppointmentReminders(id, at);
      results.push({ institutionId: id, escalated, followUps, reminders });
    } catch (error) {
      console.error("[tick] institution failed", { institutionId: id, error });
      results.push({ institutionId: id, escalated: 0, followUps: 0, reminders: 0, error: "failed" });
    }
  }
  return NextResponse.json({ at: at.toISOString(), results }, { headers: { "Cache-Control": "no-store" } });
}
