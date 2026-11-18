import Link from "next/link";
import { buttonClass } from "@/components/ui/classes";
import { HeroIllustration } from "@/components/landing/hero-illustration";
import { PILOT_LABEL, TRY_HREF, TRY_LABEL } from "@/components/landing/constants";

export function Hero({ homeHref, pilotHref }: { homeHref: string | null; pilotHref: string | null }) {
  return (
    <section aria-labelledby="hero-heading" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16 lg:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <h1 id="hero-heading" className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[2.75rem] xl:text-5xl">
            Early support for students, with people in charge
          </h1>
          <p className="mt-5 max-w-[48ch] text-lg text-ink-2">
            CampusCare helps counselling teams notice when a student may need support, then act on it with consent and clear records.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {pilotHref ? (
              <a href={pilotHref} className={buttonClass("primary", "md")}>
                {PILOT_LABEL}
              </a>
            ) : null}
            <Link href={TRY_HREF} className={buttonClass("secondary", "md")}>
              {TRY_LABEL}
            </Link>
            <Link href={homeHref ?? "/sign-in"} className={buttonClass("ghost", "md")}>
              {homeHref ? "Open CampusCare" : "Sign in"}
            </Link>
          </div>
        </div>
        <div className="lg:col-span-5">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
