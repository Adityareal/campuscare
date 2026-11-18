import { en } from "@/lib/i18n/en";
import { hi } from "@/lib/i18n/hi";

/**
 * Shown on every page while demo mode is on (rendered from the root layout only). English and
 * Hindi appear together because the layout cannot know a signed-out visitor's language. A plain
 * in-flow element, not fixed or sticky, so it does not overlay anything. On /help-now the page
 * moves itself above this notice (CSS order), so the crisis numbers stay on the first screen.
 */
export function DemoNotice() {
  return (
    <div role="note" className="border-b border-line bg-surface-2 px-4 py-2 text-sm text-ink-2">
      <div className="mx-auto grid max-w-6xl gap-1 md:px-4 lg:grid-cols-2 lg:gap-8">
        <p lang="en-IN">
          <strong className="font-semibold text-ink">{en.demoNotice.title}.</strong> {en.demoNotice.body}
        </p>
        <p lang="hi-IN">
          <strong className="font-semibold text-ink">{hi.demoNotice.title}।</strong> {hi.demoNotice.body}
        </p>
      </div>
    </div>
  );
}
