import { fill, type Dictionary } from "@/lib/i18n";

const ORDER = ["CORE_PROCESSING", "CARE_TEAM_REVIEW", "AGGREGATE_ANALYTICS"] as const;

/** Titles and descriptions for the three consent choices, with {k} filled in. */
export function consentScopes(t: Dictionary, minCohortSize: number) {
  return ORDER.map((key) => ({
    key,
    title: t.privacy.scopes[key].title,
    body: key === "AGGREGATE_ANALYTICS" ? fill(t.privacy.scopes[key].body, { k: minCohortSize }) : t.privacy.scopes[key].body,
  }));
}
