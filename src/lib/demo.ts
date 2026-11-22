import type { Role } from "@prisma/client";

const DEPLOYMENT_VALUES = ["demo", "pilot", "production"];
let warnedAboutDeployment = false;

/**
 * True only when CAMPUSCARE_DEPLOYMENT is exactly "demo". Unset, empty, "pilot", "production" or
 * anything else is off. An unrecognised value is logged once per process (this runs per request).
 */
export function isDemoDeployment(): boolean {
  const value = process.env.CAMPUSCARE_DEPLOYMENT;
  if (value !== undefined && value !== "" && !DEPLOYMENT_VALUES.includes(value) && !warnedAboutDeployment) {
    warnedAboutDeployment = true;
    console.error(`CAMPUSCARE_DEPLOYMENT has the unrecognised value "${value}". Use demo, pilot or production. Demo mode is off.`);
  }
  return value === "demo";
}

/** Test hook: forget that the unrecognised-value error was already logged. */
export function resetDeploymentWarningForTests(): void {
  warnedAboutDeployment = false;
}

/** Seed and reset scripts call this first: demo data belongs only on a site marked as a demo. */
export function assertDemoDeployment(what: string): void {
  if (process.env.CAMPUSCARE_DEPLOYMENT !== "demo") {
    throw new Error(
      `Refusing to ${what}: it loads fictional demo data and is allowed only when CAMPUSCARE_DEPLOYMENT=demo. A pilot starts from its own empty database.`,
    );
  }
}

/**
 * Demo-only people and credentials for the fictional seed data.
 * Email addresses use the reserved .example domain so they can never reach a real inbox.
 */
export const DEMO_INSTITUTION = {
  name: "Sahyadri Institute of Technology",
  slug: "sahyadri",
  city: "Pune",
  emailDomain: "sahyadri.example",
} as const;

/** A second tenant, used to show (and test) that institutions never see each other's data. */
export const SECOND_INSTITUTION = {
  name: "Narmada University",
  slug: "narmada",
  city: "Indore",
  emailDomain: "narmada.example",
} as const;

export const DEMO_PERSONAS = [
  { key: "student", label: "Student", name: "Aanya Kulkarni", email: "aanya.kulkarni@sahyadri.example", password: "AanyaCampusCare#26", role: "STUDENT" },
  { key: "counsellor", label: "Counsellor", name: "Meera Iyer", email: "meera.iyer@sahyadri.example", password: "MeeraCampusCare#26", role: "COUNSELLOR" },
  { key: "clinician", label: "Clinician", name: "Dr Rohan Desai", email: "rohan.desai@sahyadri.example", password: "RohanCampusCare#26", role: "CLINICIAN" },
  { key: "admin", label: "Institution admin", name: "Vikram Shah", email: "vikram.shah@sahyadri.example", password: "VikramCampusCare#26", role: "INSTITUTION_ADMIN" },
  { key: "platform", label: "Platform admin", name: "Neha Rao", email: "neha.rao@campuscare.example", password: "NehaCampusCare#26", role: "PLATFORM_ADMIN" },
] as const satisfies readonly { key: string; label: string; name: string; email: string; password: string; role: Role }[];

export type DemoPersona = (typeof DEMO_PERSONAS)[number];
export type DemoPersonaKey = DemoPersona["key"];

export function demoPersona(key: string): DemoPersona | undefined {
  return DEMO_PERSONAS.find((p) => p.key === key);
}
