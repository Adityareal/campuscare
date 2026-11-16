import type { NextConfig } from "next";

/**
 * Framing is refused by default (clickjacking protection for every page, including alert and
 * case actions). FRAME_ANCESTORS, read at build time, can allow specific origins to embed the
 * app, for example "http://127.0.0.1:* http://localhost:*" for a local preview panel. Leave it
 * unset for any real deployment.
 */
const frameAncestors = process.env.FRAME_ANCESTORS?.trim();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  frameAncestors
    ? { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${frameAncestors}` }
    : { key: "X-Frame-Options", value: "DENY" },
  // Camera and microphone are only needed on the consultation room page.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PGlite ships a WASM Postgres build that must be loaded by Node at runtime, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
