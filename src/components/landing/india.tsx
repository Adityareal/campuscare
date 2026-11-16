import { PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { Notice, StatusPill } from "@/components/ui";

export function India() {
  return (
    <section aria-labelledby="india-heading" className="border-t border-line bg-surface-2">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 id="india-heading" className="max-w-[26ch] text-3xl font-semibold tracking-tight md:text-4xl">
          Made for Indian campuses
        </h2>
        <p className="mt-4 max-w-[62ch] text-ink-2">
          Student screens work in English and Hindi today, with more languages planned. Dates and times follow India Standard Time. The Hindi wording is a draft that
          a native-speaking clinician must review before launch.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Languages">
          <li>
            <StatusPill tone="accent">English</StatusPill>
          </li>
          <li>
            <StatusPill tone="accent">
              <span lang="hi">हिंदी</span>
            </StatusPill>
          </li>
          <li>
            <StatusPill>More languages planned</StatusPill>
          </li>
        </ul>

        <Notice tone="info" className="mt-10 max-w-2xl" title="112 and Tele-MANAS 14416 on every crisis screen">
          <p className="flex items-start gap-2">
            <PhoneIcon size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Emergency: <strong className="font-mono">112</strong>. Tele-MANAS, free mental health support at any hour: <strong className="font-mono">14416</strong>. These
              work without signing in, from the help page.
            </span>
          </p>
        </Notice>
      </div>
    </section>
  );
}
