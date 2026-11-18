import Link from "next/link";
import { buttonClass, linkClass } from "@/components/ui/classes";

export function TryHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 md:px-8">
        <Link href="/" className="shrink-0 text-[1.05rem] font-semibold tracking-tight">
          CampusCare
        </Link>
        <nav aria-label="Page" className="ml-auto flex items-center gap-2">
          <Link href="/" className={buttonClass("ghost", "sm")}>
            Landing page
          </Link>
          <Link href="/sign-in" className={buttonClass("primary", "sm")}>
            Sign in to the full demo
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function TryFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-8 text-sm md:px-8">
        <p className="max-w-[62ch] text-ink-2">
          CampusCare is not an emergency service. If you are in danger now, call 112. Tele-MANAS (14416) describes its mental health support as free and available at any hour.
        </p>
        <p className="max-w-[62ch] text-ink-3">This page is a simulation. It uses invented sample data, saves nothing and sends nothing.</p>
        <p>
          <Link href="/help-now" className={linkClass}>
            Get help now
          </Link>
        </p>
      </div>
    </footer>
  );
}

/** Keyframes for the walk. The global reduced-motion rule shortens every animation to nothing. */
export function TryStyles() {
  return (
    <style>{`
      @keyframes demo-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes demo-line-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
    `}</style>
  );
}
