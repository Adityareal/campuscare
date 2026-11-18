const SAFEGUARDS = [
  {
    title: "No diagnosis",
    body: "Results are scores in a range on a named questionnaire. Triage labels say how soon someone should look, nothing more.",
  },
  {
    title: "No covert monitoring",
    body: "Students choose whether the care team sees their check-in trends. Nothing is watched live. A help request reaches the team because the student asked.",
  },
  {
    title: "Urgent alerts never close themselves",
    body: "Software can raise an alert. Only a person can lower or close one.",
  },
  {
    title: "Administrators see anonymous totals",
    body: "Institution leaders get aggregate counts. Groups below a minimum size, never under 5, are hidden to make it harder to identify anyone.",
  },
  {
    title: "CampusCare does not record consultations",
    body: "Video sessions are not recorded by the system, and clinical notes are open only to the clinicians involved.",
  },
] as const;

export function Safeguards() {
  return (
    <section id="safeguards" aria-labelledby="safeguards-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <p className="text-sm font-medium text-accent-text">Safeguards</p>
            <h2 id="safeguards-heading" className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Limits that are built in
            </h2>
            <p className="mt-4 text-ink-2">These are rules of the product, enforced in code, not settings an administrator can switch off.</p>
          </div>
        </div>
        <ul className="divide-y divide-line lg:col-span-8">
          {SAFEGUARDS.map((item) => (
            <li key={item.title} className="py-6 first:pt-0 last:pb-0">
              <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-1.5 max-w-[60ch] text-ink-2">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
