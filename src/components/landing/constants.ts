/**
 * The pilot request is an email, because this stage of the product has no sales form. The address
 * uses the reserved .example domain as a placeholder: replace it with a real mailbox before launch.
 */
export const PILOT_MAILTO = "mailto:pilots@campuscare.example?subject=Request%20a%20CampusCare%20pilot";

export const PILOT_LABEL = "Request a pilot";

export const LANDING_NAV = [
  { href: "#care-loop", label: "Care loop" },
  { href: "#safeguards", label: "Safeguards" },
  { href: "#roles", label: "Roles" },
  { href: "#pilot", label: "Pilot" },
] as const;

export const TRY_HREF = "/try";

export const TRY_LABEL = "Try the care loop";
