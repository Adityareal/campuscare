/** The pilot request link comes from PILOT_CONTACT_EMAIL (src/lib/pilot-contact.ts), passed down from the page. */
export const PILOT_LABEL = "Request a pilot";

export const LANDING_NAV = [
  { href: "#care-loop", label: "Care loop" },
  { href: "#safeguards", label: "Safeguards" },
  { href: "#roles", label: "Roles" },
  { href: "#pilot", label: "Pilot" },
] as const;

export const TRY_HREF = "/try";

export const TRY_LABEL = "Try the care loop";
