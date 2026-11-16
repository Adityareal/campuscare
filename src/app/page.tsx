import type { Metadata } from "next";
import { CareLoop } from "@/components/landing/care-loop";
import { EarlyWarning } from "@/components/landing/early-warning";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { India } from "@/components/landing/india";
import { Pilot } from "@/components/landing/pilot";
import { Reveal } from "@/components/landing/reveal";
import { Roles } from "@/components/landing/roles";
import { Safeguards } from "@/components/landing/safeguards";
import { getCurrentActor, homeFor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { absolute: "CampusCare | Student well-being support for universities in India" },
  description:
    "Check-ins, explainable early warning, human-led case management and telehealth for Indian universities. Now preparing pilots.",
};

/** Public landing page. It reads the session only to swap the header button for a way back in. */
export default async function LandingPage() {
  const actor = await getCurrentActor();
  const homeHref = actor ? homeFor(actor.role) : null;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-40 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <LandingHeader homeHref={homeHref} />
      <main id="main">
        <Hero homeHref={homeHref} />
        <Reveal>
          <CareLoop />
        </Reveal>
        <Reveal>
          <EarlyWarning />
        </Reveal>
        <Reveal>
          <Safeguards />
        </Reveal>
        <Reveal>
          <Roles />
        </Reveal>
        <Reveal>
          <India />
        </Reveal>
        <Reveal>
          <Pilot />
        </Reveal>
      </main>
      <LandingFooter />
    </>
  );
}
