import { CareLoopStepper } from "@/components/landing/care-loop-stepper";

export function CareLoop() {
  return (
    <section id="care-loop" aria-labelledby="care-loop-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 id="care-loop-heading" className="max-w-[22ch] text-3xl font-semibold tracking-tight md:text-4xl">
          One loop from check-in to follow-up
        </h2>
        <p className="mt-4 max-w-[60ch] text-ink-2">Each part hands over to a person. Nothing in the loop acts on a student alone.</p>
        <CareLoopStepper />
      </div>
    </section>
  );
}
