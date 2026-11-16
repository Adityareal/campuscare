import { KeyValueList, TriageBadge } from "@/components/ui";
import { RuleWidget } from "@/components/landing/rule-widget";

export function EarlyWarning() {
  return (
    <section aria-labelledby="early-warning-heading" className="border-t border-line bg-surface-2">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 id="early-warning-heading" className="max-w-[24ch] text-3xl font-semibold tracking-tight md:text-4xl">
          Every flag explains itself
        </h2>
        <p className="mt-4 max-w-[62ch] text-ink-2">
          Flags come from written rules, not from a model reading student answers. The care team sees which rule fired and the evidence it used, so they can
          agree, disagree or ask for more.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
          <div className="rounded-panel border border-line bg-surface px-5 py-5">
            <KeyValueList
              items={[
                { label: "What was seen", value: "The check-ins, questionnaire scores or help requests that matched the rule, with dates." },
                { label: "Which rule", value: "The rule name and version, so a clinician can read the logic and adjust it." },
                { label: "How urgent", value: "A triage label that sets how soon someone should look. It is not a diagnosis." },
                { label: "Who decides", value: "A counsellor or clinician records the decision. An urgent alert needs a recorded contact attempt and a written note before it can close." },
              ]}
            />
          </div>
          <div className="grid content-start gap-4">
            <p className="text-sm font-medium text-ink">The four triage labels</p>
            <ul className="flex flex-wrap gap-2">
              {(["ROUTINE", "MONITOR", "PRIORITY", "URGENT"] as const).map((category) => (
                <li key={category}>
                  <TriageBadge category={category} />
                </li>
              ))}
            </ul>
            <p className="max-w-[44ch] text-sm text-ink-2">
              Each label comes with a response time that your institution sets. Colour is never the only signal: every label also has an icon and a word.
            </p>
          </div>
        </div>

        <div className="mt-12">
          <RuleWidget />
        </div>
      </div>
    </section>
  );
}
