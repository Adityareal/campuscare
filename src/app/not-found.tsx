import Link from "next/link";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-5 px-4 py-12">
      <p className="text-sm text-ink-3">CampusCare</p>
      <h1 className="text-2xl font-semibold tracking-tight">We could not find that page</h1>
      <p className="max-w-[60ch] text-ink-2">The link may be old or mistyped, or you may not have access to that page.</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/">Go to the home page</ButtonLink>
        <ButtonLink href="/help-now" variant="secondary">
          Get help now
        </ButtonLink>
      </div>
      <p className="text-sm text-ink-3">
        If you are in danger now, call 112. For free mental health support at any hour, call Tele-MANAS on 14416.{" "}
        <Link href="/sign-in" className="font-medium text-accent-text underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
