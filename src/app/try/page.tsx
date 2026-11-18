import type { Metadata } from "next";
import { TryFlow } from "@/components/demo/try-flow";
import { TryFooter, TryHeader, TryStyles } from "@/components/demo/try-chrome";
import { demoModeEnabled } from "@/lib/auth/session";
import { parseStage } from "@/lib/demo-flow/content";

export const metadata: Metadata = {
  title: "Try the care loop | CampusCare",
  description:
    "A guided simulation of the CampusCare care loop on sample data: a student's check-ins, the written rules, a counsellor's decision, a case, and what leaders see.",
};

/** Public and read-only. The stage in the address makes any point in the walk linkable. */
export default async function TryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { stage } = await searchParams;
  const initialStage = parseStage(stage) ?? "student";

  return (
    <>
      <TryStyles />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-40 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <TryHeader />
      <main id="main">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">
          <h1 className="max-w-[20ch] text-3xl font-semibold tracking-tight md:text-5xl">Try the care loop</h1>
          <p className="mt-4 max-w-[62ch] text-ink-2">
            Play a student, watch the written rules read the answers, then make the counsellor&apos;s decision and follow the case to the end. The forms below are the
            real rules running on sample data. Nothing is saved or sent.
          </p>
          <div className="mt-8">
            <TryFlow initialStage={initialStage} hasSignInDemo={demoModeEnabled()} />
          </div>
        </div>
      </main>
      <TryFooter />
    </>
  );
}
