import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic by default: a page opts into caching with 'use cache'. See
  // context/epic-lebowski/rendering-strategies.md.
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  experimental: {
    // No anonymous feedback from `next dev` about how agents use Next.
    agentFeedback: false,
  },
  // Never show the app inside a frame on another site, against clickjacking.
  // frame-ancestors is the modern way; X-Frame-Options covers older browsers.
  // These are set in the router, before any page runs, so static pages stay
  // static. WEB-45 adds the full CSP, HSTS and poweredByHeader.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
