import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Noto_Sans_Devanagari } from "next/font/google";
import { demoModeEnabled, getCurrentActor } from "@/lib/auth/session";
import { DemoNotice } from "@/components/ui/demo-notice";
import { HTML_LANG } from "@/lib/i18n";
import "./globals.css";

// Self-hosted by next/font. unicode-range means the file only downloads when Hindi text renders.
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "CampusCare", template: "%s | CampusCare" },
  description:
    "Student well-being check-ins, explainable early warning, human-led case management and telehealth for universities in India.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1412" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await getCurrentActor();
  return (
    <html lang={HTML_LANG[actor?.locale ?? "en"]} className={`${GeistSans.variable} ${GeistMono.variable} ${devanagari.variable}`}>
      <body className="flex min-h-dvh flex-col bg-canvas text-ink antialiased">
        {demoModeEnabled() ? <DemoNotice /> : null}
        {children}
      </body>
    </html>
  );
}
