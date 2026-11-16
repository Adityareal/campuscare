import Link from "next/link";
import { PILOT_LABEL, PILOT_MAILTO } from "@/components/landing/constants";

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="font-semibold tracking-tight">CampusCare</p>
          <p className="mt-3 max-w-[62ch] text-sm text-ink-2">
            CampusCare is not an emergency service. If you are in danger now, call 112. Tele-MANAS (14416) offers free mental health support at any hour.
          </p>
          <p className="mt-3 max-w-[62ch] text-sm text-ink-3">
            Consent is designed around Digital Personal Data Protection Act 2023 principles. CampusCare makes no compliance claim, and legal review is required before
            launch.
          </p>
        </div>
        <nav aria-label="Footer" className="grid content-start gap-2 text-sm lg:col-span-5 lg:justify-self-end">
          <Link href="/help-now" className="font-medium text-accent-text underline decoration-1 underline-offset-4 hover:decoration-2">
            Get help now
          </Link>
          <Link href="/sign-in" className="text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <a href={PILOT_MAILTO} className="text-ink-2 hover:text-ink">
            {PILOT_LABEL}
          </a>
        </nav>
      </div>
    </footer>
  );
}
