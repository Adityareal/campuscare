import type { Role } from "@prisma/client";

/**
 * Demo data contract shared by the seed script and the sign-in page. Persona sign-in buttons
 * appear only when DEMO_MODE=true, and only for users the seed created with isDemo = true.
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
  { key: "student", label: "Student", name: "Aanya Kulkarni", email: "aanya.kulkarni@sahyadri.example", role: "STUDENT" },
  { key: "counsellor", label: "Counsellor", name: "Meera Iyer", email: "meera.iyer@sahyadri.example", role: "COUNSELLOR" },
  { key: "clinician", label: "Clinician", name: "Dr Rohan Desai", email: "rohan.desai@sahyadri.example", role: "CLINICIAN" },
  { key: "admin", label: "Institution admin", name: "Vikram Shah", email: "vikram.shah@sahyadri.example", role: "INSTITUTION_ADMIN" },
  { key: "platform", label: "Platform admin", name: "Neha Rao", email: "neha.rao@campuscare.example", role: "PLATFORM_ADMIN" },
] as const satisfies readonly { key: string; label: string; name: string; email: string; role: Role }[];

export type DemoPersona = (typeof DEMO_PERSONAS)[number];
export type DemoPersonaKey = DemoPersona["key"];

export function demoPersona(key: string): DemoPersona | undefined {
  return DEMO_PERSONAS.find((p) => p.key === key);
}
