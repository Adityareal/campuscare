"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Logged for diagnosis. The message itself is never shown, because it could contain details.
    console.error("[app] unhandled error", error.digest ?? "");
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-5 px-4 py-12">
      <p className="text-sm text-ink-3">CampusCare</p>
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong on our side</h1>
      <p className="max-w-[60ch] text-ink-2">
        Please try again. If it keeps happening, tell your institution's CampusCare contact
        {error.digest ? (
          <>
            {" "}
            and quote this reference: <span className="font-mono text-[0.9em]">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to the home page
        </ButtonLink>
        <ButtonLink href="/help-now" variant="secondary">
          Get help now
        </ButtonLink>
      </div>
      <p className="text-sm text-ink-3">
        If you are in danger now, call 112. For free mental health support at any hour, call Tele-MANAS on 14416. You can also{" "}
        <Link href="/help-now" className="font-medium text-accent-text underline underline-offset-4">
          see all crisis contacts
        </Link>
        .
      </p>
    </main>
  );
}
