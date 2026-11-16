import Link from "next/link";
import { cx } from "@/components/ui/classes";

/** Query-string tabs rendered as links. The current tab carries aria-current and a visible underline. */
export function QueryTabs({ label, tabs, current }: { label: string; tabs: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="mb-5 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm",
              active ? "border-accent font-medium text-accent-text" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
