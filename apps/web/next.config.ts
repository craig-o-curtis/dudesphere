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
    // Lets requireAdmin call forbidden() and render app/forbidden.tsx (WEB-11).
    authInterrupts: true,
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
      // The reset page's URL holds the token from the email (AUTH-9).
      // strict-origin sends only the origin in a Referer, never the path or
      // query, so no link or resource on the page can carry the token to
      // another site. Not no-referrer: under it, a plain HTML form post sends
      // `Origin: null`, and Next refuses the Server Action because null
      // doesn't match the host. strict-origin keeps Origin real for any
      // plain post.
      // Matching ignores the query string, so this covers "?token=".
      {
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "strict-origin" }],
      },
    ];
  },
};

export default nextConfig;
