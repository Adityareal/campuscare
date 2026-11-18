import Link from "next/link";
import { buttonClass } from "@/components/ui/classes";
import { LANDING_NAV, PILOT_LABEL, TRY_HREF, TRY_LABEL } from "@/components/landing/constants";

/**
 * One-line navigation, 64px tall. `homeHref` is set when the visitor is signed in: the Sign in
 * button then becomes "Open CampusCare" and leads to that person's home.
 */
export function LandingHeader({ homeHref, pilotHref }: { homeHref: string | null; pilotHref: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 md:px-8">
        <Link href="/" className="shrink-0 text-[1.05rem] font-semibold tracking-tight">
          CampusCare
        </Link>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-1 lg:flex">
          {LANDING_NAV.map((item) => (
            <a key={item.href} href={item.href} className="rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              {item.label}
            </a>
          ))}
          <Link href={TRY_HREF} className="rounded-control px-3 py-2 text-sm font-medium text-accent-text hover:bg-surface-2">
            {TRY_LABEL}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {homeHref ? (
            <Link href={homeHref} className={buttonClass("primary", "sm")}>
              Open CampusCare
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              {pilotHref ? (
                <a href={pilotHref} className={buttonClass("primary", "sm", "max-sm:hidden")}>
                  {PILOT_LABEL}
                </a>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
