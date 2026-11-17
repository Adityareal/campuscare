import type { HelpRequestType, Instrument, TriageCategory } from "@prisma/client";
import { fmtDay, fmtTime } from "@/lib/format";
import { BAND_LABEL, type SeverityBand } from "@/lib/instruments";
import { CATEGORY_RANK, maxCategory, RULE_LABELS, type RiskRules } from "@/lib/risk/rules";

/**
 * Rule-based early-warning engine (PRD module C, Phase 1).
 *
 * Pure functions only: given a student's permitted data and the institution's rules, return
 * explainable findings. No machine-learning model and no free text is involved. Every finding
 * says which rule fired, on which evidence, and why, so a human reviewer can check it.
 * Output categories are operational triage labels, never diagnoses or predictions.
 */

export type RiskDomain = "CHECK_IN" | "SCREENING" | "HELP_SEEKING" | "COMBINED";

export type EvidenceRef = {
  kind: "check_in" | "assessment" | "help_request" | "finding";
  id: string;
  at: string;
  label: string;
  value: number | null;
};

export type Finding = {
  ruleCode: string;
  ruleVersion: number;
  domain: RiskDomain;
  category: TriageCategory;
  /** Anchored findings describe one event (a response, a request) and never re-fire for it.
   * Pattern findings describe a trend and are de-duplicated by rule while an alert is open. */
  anchored: boolean;
  dedupeKey: string;
  explanation: string;
  evidence: EvidenceRef[];
};

export type CheckInPoint = {
  id: string;
  at: Date;
  mood: number | null;
  stress: number | null;
  sleep: number | null;
  energy: number | null;
  social: number | null;
  academicPressure: number | null;
};

export type AssessmentPoint = {
  id: string;
  at: Date;
  instrument: Instrument;
  total: number;
  band: SeverityBand;
  safetyItemPositive: boolean;
};

export type HelpPoint = { id: string; at: Date; type: HelpRequestType };

export type RiskInput = {
  now: Date;
  rules: RiskRules;
  /** False when the student has not consented to care-team review: only explicit help
   * requests are evaluated, never check-in or screening patterns. */
  includePatterns: boolean;
  checkIns: CheckInPoint[];
  assessments: AssessmentPoint[];
  helpRequests: HelpPoint[];
};

export type RiskEvaluation = { findings: Finding[]; category: TriageCategory };

const DAY_MS = 86_400_000;

function within(at: Date, now: Date, days: number): boolean {
  const age = now.getTime() - at.getTime();
  return age <= days * DAY_MS && age >= -60_000;
}

const byTime = <T extends { at: Date }>(a: T, b: T) => a.at.getTime() - b.at.getTime();

function ev(kind: EvidenceRef["kind"], id: string, at: Date, label: string, value: number | null = null): EvidenceRef {
  return { kind, id, at: at.toISOString(), label, value };
}

const CHECKIN_FIELD_LABEL = {
  stress: "Stress",
  academicPressure: "Academic pressure",
  mood: "Mood",
  sleep: "Sleep quality",
  social: "Social connection",
} as const;

type ScaleField = keyof typeof CHECKIN_FIELD_LABEL;

function series(points: CheckInPoint[], field: ScaleField) {
  return points.filter((p) => p[field] !== null).map((p) => ({ id: p.id, at: p.at, value: p[field] as number }));
}

function list(points: { at: Date; value: number }[]): string {
  return points.map((p) => `${fmtDay(p.at)} (${p.value})`).join(", ");
}

export function evaluateRisk(input: RiskInput): RiskEvaluation {
  const { now, rules } = input;
  const v = rules.version;
  const findings: Finding[] = [];

  // ---- Help-seeking: explicit requests from the student ----
  const help = input.helpRequests.filter((h) => within(h.at, now, 60)).sort(byTime);
  for (const h of help) {
    if (h.type === "URGENT_SUPPORT" && within(h.at, now, rules.urgentHelpRequest.withinDays)) {
      findings.push({
        ruleCode: "URGENT_HELP_REQUEST",
        ruleVersion: v,
        domain: "HELP_SEEKING",
        category: "URGENT",
        anchored: true,
        dedupeKey: `URGENT_HELP_REQUEST:${h.id}`,
        explanation: `The student asked for urgent support on ${fmtDay(h.at)} at ${fmtTime(h.at)}.`,
        evidence: [ev("help_request", h.id, h.at, "Urgent support request")],
      });
    }
  }
  const rr = rules.repeatedHelpRequests;
  if (rr.enabled) {
    const recent = help.filter((h) => within(h.at, now, rr.withinDays));
    const last = recent.at(-1);
    if (last && recent.length >= rr.count) {
      findings.push({
        ruleCode: "REPEATED_HELP_REQUESTS",
        ruleVersion: v,
        domain: "HELP_SEEKING",
        category: rr.category,
        anchored: false,
        dedupeKey: `REPEATED_HELP_REQUESTS:${last.id}`,
        explanation: `${recent.length} support requests in the last ${rr.withinDays} days (threshold ${rr.count}).`,
        evidence: recent.map((h) => ev("help_request", h.id, h.at, "Support request")),
      });
    }
  }

  if (input.includePatterns) {
    findings.push(...screeningFindings(input), ...checkInFindings(input));
  }

  // ---- Corroboration across independent sources ----
  if (rules.combinedPatterns.enabled) {
    const monitor = findings.filter((f) => f.category === "MONITOR");
    const domains = new Set(monitor.map((f) => f.domain));
    if (domains.size >= rules.combinedPatterns.minDomains) {
      const codes = [...new Set(monitor.map((f) => f.ruleCode))].sort();
      findings.push({
        ruleCode: "COMBINED_PATTERNS",
        ruleVersion: v,
        domain: "COMBINED",
        category: "PRIORITY",
        anchored: false,
        dedupeKey: `COMBINED_PATTERNS:${codes.join("+")}`,
        explanation: `Concerns appeared in ${domains.size} independent sources at the same time: ${codes
          .map((c) => (RULE_LABELS[c] ?? c).toLowerCase())
          .join("; ")}. Together they call for a timely human review.`,
        evidence: monitor.map((f) => ({ kind: "finding" as const, id: f.dedupeKey, at: now.toISOString(), label: RULE_LABELS[f.ruleCode] ?? f.ruleCode, value: null })),
      });
    }
  }

  return { findings, category: maxCategory(...findings.map((f) => f.category)) };
}

function screeningFindings({ now, rules, assessments }: RiskInput): Finding[] {
  const out: Finding[] = [];
  const v = rules.version;
  const of = (code: Instrument) => assessments.filter((a) => a.instrument === code).sort(byTime);
  const phq = of("PHQ9");
  const gad = of("GAD7");

  for (const a of phq) {
    if (a.safetyItemPositive && within(a.at, now, rules.phq9SafetyItem.withinDays)) {
      out.push({
        ruleCode: "PHQ9_SAFETY_ITEM",
        ruleVersion: v,
        domain: "SCREENING",
        category: rules.phq9SafetyItem.category,
        anchored: true,
        dedupeKey: `PHQ9_SAFETY_ITEM:${a.id}`,
        explanation: `On the PHQ-9 completed ${fmtDay(a.at)}, question 9 (thoughts of being better off dead or of self-harm) was answered above "Not at all". Any positive answer to this question needs prompt human follow-up.`,
        evidence: [ev("assessment", a.id, a.at, "PHQ-9 question 9", null)],
      });
    }
  }

  const band = (code: "PHQ9" | "GAD7", latest: AssessmentPoint | undefined) => {
    if (!latest) return;
    const cfg = code === "PHQ9" ? rules.phq9Bands : rules.gad7Bands;
    if (!within(latest.at, now, cfg.withinDays)) return;
    const byBand: Partial<Record<SeverityBand, "NONE" | "MONITOR" | "PRIORITY">> =
      code === "PHQ9"
        ? { MODERATE: rules.phq9Bands.MODERATE, MODERATELY_SEVERE: rules.phq9Bands.MODERATELY_SEVERE, SEVERE: rules.phq9Bands.SEVERE }
        : { MODERATE: rules.gad7Bands.MODERATE, SEVERE: rules.gad7Bands.SEVERE };
    const cat = byBand[latest.band];
    if (cat !== "MONITOR" && cat !== "PRIORITY") return;
    const name = code === "PHQ9" ? "PHQ-9" : "GAD-7";
    const max = code === "PHQ9" ? 27 : 21;
    out.push({
      ruleCode: `${code}_SEVERITY`,
      ruleVersion: v,
      domain: "SCREENING",
      category: cat,
      anchored: true,
      dedupeKey: `${code}_SEVERITY:${latest.id}`,
      explanation: `${name} score ${latest.total} of ${max} on ${fmtDay(latest.at)}, in the ${BAND_LABEL[latest.band].toLowerCase()} range. This is a screening score, not a diagnosis.`,
      evidence: [ev("assessment", latest.id, latest.at, `${name} total`, latest.total)],
    });
  };
  band("PHQ9", phq.at(-1));
  band("GAD7", gad.at(-1));

  const sr = rules.scoreRise;
  if (sr.enabled) {
    const rise = (code: "PHQ9" | "GAD7", seriesOf: AssessmentPoint[], points: number) => {
      const latest = seriesOf.at(-1);
      const prev = seriesOf.at(-2);
      if (!latest || !prev) return;
      if (latest.at.getTime() - prev.at.getTime() > sr.comparisonDays * DAY_MS) return;
      if (!within(latest.at, now, 30)) return;
      const delta = latest.total - prev.total;
      if (delta < points) return;
      const name = code === "PHQ9" ? "PHQ-9" : "GAD-7";
      out.push({
        ruleCode: `${code}_SCORE_RISE`,
        ruleVersion: v,
        domain: "SCREENING",
        category: sr.category,
        anchored: true,
        dedupeKey: `${code}_SCORE_RISE:${latest.id}`,
        explanation: `${name} rose from ${prev.total} to ${latest.total} (+${delta}) between ${fmtDay(prev.at)} and ${fmtDay(latest.at)}. The configured change threshold is ${points} points.`,
        evidence: [ev("assessment", prev.id, prev.at, `${name} total`, prev.total), ev("assessment", latest.id, latest.at, `${name} total`, latest.total)],
      });
    };
    rise("PHQ9", phq, sr.phq9Points);
    rise("GAD7", gad, sr.gad7Points);
  }
  return out;
}

function checkInFindings({ now, rules, checkIns }: RiskInput): Finding[] {
  const out: Finding[] = [];
  const v = rules.version;
  const points = checkIns.filter((c) => within(c.at, now, rules.checkInLookbackDays)).sort(byTime);

  const sh = rules.sustainedHigh;
  if (sh.enabled) {
    for (const [field, code] of [
      ["stress", "SUSTAINED_HIGH_STRESS"],
      ["academicPressure", "SUSTAINED_ACADEMIC_PRESSURE"],
    ] as const) {
      const last = series(points, field).slice(-sh.consecutive);
      if (last.length < sh.consecutive) continue;
      if (!last.every((p) => p.value >= sh.threshold && within(p.at, now, sh.withinDays))) continue;
      out.push({
        ruleCode: code,
        ruleVersion: v,
        domain: "CHECK_IN",
        category: sh.category,
        anchored: false,
        dedupeKey: `${code}:${last.at(-1)!.id}`,
        explanation: `${CHECKIN_FIELD_LABEL[field]} rated ${sh.threshold} or higher (out of 5) in the last ${sh.consecutive} check-ins: ${list(last)}.`,
        evidence: last.map((p) => ev("check_in", p.id, p.at, CHECKIN_FIELD_LABEL[field], p.value)),
      });
    }
  }

  const pl = rules.persistentLow;
  if (pl.enabled) {
    for (const [field, code] of [
      ["mood", "PERSISTENT_LOW_MOOD"],
      ["sleep", "REPEATED_POOR_SLEEP"],
      ["social", "PERSISTENT_ISOLATION"],
    ] as const) {
      const last = series(points, field).slice(-pl.ofLast);
      if (last.length < pl.ofLast) continue;
      const low = last.filter((p) => p.value <= pl.threshold);
      if (low.length < pl.count) continue;
      out.push({
        ruleCode: code,
        ruleVersion: v,
        domain: "CHECK_IN",
        category: pl.category,
        anchored: false,
        dedupeKey: `${code}:${last.at(-1)!.id}`,
        explanation: `${CHECKIN_FIELD_LABEL[field]} rated ${pl.threshold} or lower (out of 5) in ${low.length} of the last ${pl.ofLast} check-ins: ${list(last)}.`,
        evidence: last.map((p) => ev("check_in", p.id, p.at, CHECKIN_FIELD_LABEL[field], p.value)),
      });
    }
  }

  const dw = rules.decliningWellbeing;
  if (dw.enabled) {
    const composite = points
      .map((p) => {
        const vals = [p.mood, p.energy, p.sleep, p.social].filter((x): x is number => x !== null);
        return vals.length >= 2 ? { id: p.id, at: p.at, value: vals.reduce((a, b) => a + b, 0) / vals.length } : null;
      })
      .filter((x): x is { id: string; at: Date; value: number } => x !== null)
      .slice(-dw.window * 2);
    if (composite.length === dw.window * 2) {
      const mean = (xs: { value: number }[]) => xs.reduce((a, b) => a + b.value, 0) / xs.length;
      const before = mean(composite.slice(0, dw.window));
      const after = mean(composite.slice(dw.window));
      if (before - after >= dw.drop) {
        out.push({
          ruleCode: "DECLINING_WELLBEING",
          ruleVersion: v,
          domain: "CHECK_IN",
          category: dw.category,
          anchored: false,
          dedupeKey: `DECLINING_WELLBEING:${composite.at(-1)!.id}`,
          explanation: `Average self-reported well-being (mood, energy, sleep and connection) fell from ${before.toFixed(1)} to ${after.toFixed(1)} out of 5 across the last ${dw.window * 2} check-ins.`,
          evidence: composite.map((p) => ev("check_in", p.id, p.at, "Well-being average", Math.round(p.value * 10) / 10)),
        });
      }
    }
  }
  return out;
}

// ---------- Reconciling findings with the student's alert history ----------

export type AlertHistory = {
  open: { id: string; category: TriageCategory; ruleCodes: Set<string> } | null;
  /** Every dedupeKey ever attached to this student's alerts, open or closed. */
  seenDedupeKeys: Set<string>;
  /** Indicators of alerts a human closed recently. */
  recentlyClosed: { ruleCode: string; category: TriageCategory; closedAt: Date }[];
};

export type AlertPlan = {
  action: "none" | "create" | "attach";
  findings: Finding[];
  suppressed: { finding: Finding; reason: string }[];
  category: TriageCategory;
  /** Set when attaching raises the open alert's category. Categories are never lowered here. */
  raisedTo: TriageCategory | null;
};

export function planAlertUpdate(findings: Finding[], history: AlertHistory, now: Date, cooldownDays: number): AlertPlan {
  const accepted: Finding[] = [];
  const suppressed: AlertPlan["suppressed"] = [];
  for (const f of findings) {
    if (f.anchored) {
      if (history.seenDedupeKeys.has(f.dedupeKey)) {
        suppressed.push({ finding: f, reason: "Already raised for this evidence." });
        continue;
      }
    } else {
      if (history.open?.ruleCodes.has(f.ruleCode)) {
        suppressed.push({ finding: f, reason: "Already on the open alert." });
        continue;
      }
      const reviewed = history.recentlyClosed.find(
        (c) =>
          c.ruleCode === f.ruleCode &&
          now.getTime() - c.closedAt.getTime() <= cooldownDays * DAY_MS &&
          CATEGORY_RANK[f.category] <= CATEGORY_RANK[c.category],
      );
      if (reviewed && f.category !== "URGENT") {
        suppressed.push({ finding: f, reason: `Same pattern reviewed and closed on ${fmtDay(reviewed.closedAt)}.` });
        continue;
      }
    }
    accepted.push(f);
  }
  if (accepted.length === 0) {
    return { action: "none", findings: [], suppressed, category: history.open?.category ?? "ROUTINE", raisedTo: null };
  }
  const incoming = maxCategory(...accepted.map((f) => f.category));
  if (history.open) {
    const raisedTo = CATEGORY_RANK[incoming] > CATEGORY_RANK[history.open.category] ? incoming : null;
    return { action: "attach", findings: accepted, suppressed, category: raisedTo ?? history.open.category, raisedTo };
  }
  return { action: "create", findings: accepted, suppressed, category: incoming, raisedTo: null };
}

export const CATEGORY_LEAD: Record<TriageCategory, string> = {
  ROUTINE: "Routine",
  MONITOR: "Monitor",
  PRIORITY: "Priority review",
  URGENT: "Urgent review",
};

export function alertTitle(category: TriageCategory, findings: Finding[]): string {
  const lead = CATEGORY_LEAD[category];
  const top = [...findings].sort((a, b) => CATEGORY_RANK[b.category] - CATEGORY_RANK[a.category])[0];
  if (!top) return lead;
  // Lower-case the first letter of ordinary words ("High stress") but keep acronyms ("PHQ-9").
  const label = (RULE_LABELS[top.ruleCode] ?? top.ruleCode).replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());
  return `${lead}: ${label}`;
}

export const RECOMMENDED_ACTION: Record<TriageCategory, string> = {
  ROUTINE: "No review needed. Regular check-ins continue.",
  MONITOR: "Review the evidence and decide whether a gentle check-in message or a further screen would help.",
  PRIORITY: "Review promptly and reach out to the student through an authorised channel.",
  URGENT: "Follow the institution's crisis protocol now. Contact the on-call responder and record every attempt.",
};
