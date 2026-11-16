"use client";

import { useId, useState } from "react";
import { buttonClass, inputClass } from "@/components/ui/classes";
import { fmtDateTime } from "@/lib/format";

/** Shows a one-time set-password link exactly once, with guidance on handing it over safely. */
export function OneTimeLink({ link, linkFor, expiresAt }: { link: string; linkFor?: string; expiresAt?: string }) {
  const id = useId();
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="grid gap-3 rounded-panel border border-line bg-surface-2 px-4 py-4">
      <div>
        <p className="font-semibold">One-time sign-in link{linkFor ? ` for ${linkFor}` : ""}</p>
        <p className="mt-1 text-sm text-ink-2">
          Copy this link now and give it to the person directly, for example in person or through your institution email. It
          works once{expiresAt ? `, until ${fmtDateTime(new Date(expiresAt))}` : ""}. It will not be shown again. If it is
          lost, use Reset access to create a new one.
        </p>
      </div>
      <div className="grid gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          Link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id={id} readOnly value={link} className={`${inputClass} font-mono text-sm`} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={copy} className={buttonClass("secondary", "md", "shrink-0")}>
            Copy link
          </button>
        </div>
        <p role="status" className="text-sm text-ink-3">
          {copied === "done" ? "Copied to the clipboard." : copied === "failed" ? "Copy did not work. Select the link and copy it by hand." : ""}
        </p>
      </div>
    </div>
  );
}
