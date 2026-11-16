import type { TriageCategory } from "@/generated/prisma/enums";
import type { DbLike } from "@/lib/db";
import { fail } from "@/lib/errors";
import { parseRules, type RiskRules } from "@/lib/risk/rules";

export type CrisisContact = { label: string; phone: string; hours: string };

/** Always shown, whatever the institution configures. Verified against MoHFW publications. */
export const NATIONAL_CRISIS_CONTACTS: CrisisContact[] = [
  { label: "Emergency (police, fire, ambulance)", phone: "112", hours: "24x7" },
  { label: "Tele-MANAS national mental health helpline", phone: "14416", hours: "24x7" },
  { label: "Tele-MANAS toll-free", phone: "1-800-891-4416", hours: "24x7" },
];

export type InstitutionSettings = {
  institutionId: string;
  institutionName: string;
  checkInCadence: "DAILY" | "WEEKLY";
  minCohortSize: number;
  careTeamHours: string;
  campusContacts: CrisisContact[];
  onCallResponderId: string | null;
  urgentAckMinutes: number;
  priorityAckHours: number;
  monitorAckHours: number;
  rules: RiskRules;
};

/** Small cohorts below this size are never shown, whatever an institution configures. */
export const MIN_COHORT_FLOOR = 5;

export async function getInstitutionSettings(client: DbLike, institutionId: string): Promise<InstitutionSettings> {
  const row = await client.institutionConfiguration.findUnique({
    where: { institutionId },
    include: { institution: { select: { name: true } } },
  });
  if (!row) fail("NOT_FOUND", "Institution configuration is missing.");
  const contacts = Array.isArray(row.crisisContacts) ? (row.crisisContacts as CrisisContact[]) : [];
  return {
    institutionId,
    institutionName: row.institution.name,
    checkInCadence: row.checkInCadence,
    minCohortSize: Math.max(MIN_COHORT_FLOOR, row.minCohortSize),
    careTeamHours: row.careTeamHours,
    campusContacts: contacts.filter((c) => c && typeof c.phone === "string"),
    onCallResponderId: row.onCallResponderId,
    urgentAckMinutes: row.urgentAckMinutes,
    priorityAckHours: row.priorityAckHours,
    monitorAckHours: row.monitorAckHours,
    rules: parseRules(row.riskRules),
  };
}

/** Time allowed between an alert being raised and a human acknowledging it. */
export function ackWindowMs(category: TriageCategory, s: Pick<InstitutionSettings, "urgentAckMinutes" | "priorityAckHours" | "monitorAckHours">): number {
  switch (category) {
    case "URGENT":
      return s.urgentAckMinutes * 60_000;
    case "PRIORITY":
      return s.priorityAckHours * 3_600_000;
    default:
      return s.monitorAckHours * 3_600_000;
  }
}
