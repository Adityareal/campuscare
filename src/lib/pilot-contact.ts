/**
 * The address people write to for a pilot, read from PILOT_CONTACT_EMAIL each time it is called
 * (so a changed value takes effect after a redeploy, with no code change). Call it from server
 * code only and pass the result down as a prop: the address is never bundled for the browser.
 *
 * Returns a mailto link, or null when the setting is unset or is not exactly one plain,
 * deliverable address. Anything that could add recipients or headers to the link is rejected.
 */
const SUBJECT = "Request a CampusCare pilot";

// Letters, digits and . _ + - in the local part; dotted labels in the host; an alphabetic final
// label (this also rejects IP literals such as 10.0.0.1 and [::1]).
const ADDRESS = /^[A-Za-z0-9._+-]+@((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,})$/;
const RESERVED_SUFFIXES = ["example", "test", "invalid", "localhost", "local", "internal"];
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org"];

export function pilotContactMailto(): string | null {
  const address = (process.env.PILOT_CONTACT_EMAIL ?? "").trim();
  if (!address || address.length > 254) return null;
  const match = ADDRESS.exec(address);
  if (!match?.[1]) return null;
  const host = match[1].toLowerCase();
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (RESERVED_SUFFIXES.includes(tld)) return null;
  if (RESERVED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return null;
  return `mailto:${address}?subject=${encodeURIComponent(SUBJECT)}`;
}
