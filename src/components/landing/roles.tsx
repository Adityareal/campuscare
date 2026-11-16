import { RoleTabs } from "@/components/landing/role-tabs";

export function Roles() {
  return (
    <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 id="roles-heading" className="max-w-[24ch] text-3xl font-semibold tracking-tight md:text-4xl">
          What each role sees
        </h2>
        <p className="mt-4 max-w-[62ch] text-ink-2">Each role sees only what the job needs. Pick a role to see a preview built from sample data.</p>
        <RoleTabs />
      </div>
    </section>
  );
}
