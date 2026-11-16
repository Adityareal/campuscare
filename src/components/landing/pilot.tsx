import Link from "next/link";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonClass } from "@/components/ui/classes";
import { PILOT_LABEL, PILOT_MAILTO, TRY_HREF, TRY_LABEL } from "@/components/landing/constants";

const NEEDS = [
  { verb: "Name", rest: "a small care team of counsellors and at least one clinician who will review alerts." },
  { verb: "Confirm", rest: "your campus crisis contacts and the hours the care team is reachable." },
  { verb: "Agree", rest: "the written triage rules and response times with your clinicians." },
  { verb: "Invite", rest: "a first group of students and staff, using invitation codes." },
  { verb: "Review", rest: "the consent wording and data handling with your legal and clinical advisers." },
  { verb: "Switch off", rest: "demo mode and set the encryption key, database and scheduled job before real data enters." },
] as const;

export function Pilot() {
  return (
    <section id="pilot" aria-labelledby="pilot-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <p className="text-sm font-medium text-accent-text">Pilot stage</p>
          <h2 id="pilot-heading" className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            What a pilot needs from you
          </h2>
          <p className="mt-4 max-w-[46ch] text-ink-2">
            CampusCare is being prepared for pilots. Consent is designed around the principles of the Digital Personal Data Protection Act 2023, and legal review is
            required before launch.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={PILOT_MAILTO} className={buttonClass("primary", "md")}>
              {PILOT_LABEL}
            </a>
            <Link href={TRY_HREF} className={buttonClass("secondary", "md")}>
              {TRY_LABEL}
            </Link>
          </div>
        </div>
        <ul className="grid content-start gap-x-8 gap-y-6 sm:grid-cols-2 lg:col-span-7">
          {NEEDS.map((need) => (
            <li key={need.verb} className="grid grid-cols-[auto_1fr] gap-x-3">
              <CheckCircleIcon size={22} className="mt-0.5 text-accent-text" aria-hidden />
              <p className="text-ink-2">
                <strong className="font-semibold text-ink">{need.verb}</strong> {need.rest}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
