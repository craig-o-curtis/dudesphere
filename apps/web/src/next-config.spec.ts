// @vitest-environment node
// Checks the headers next.config.ts adds. It sits in src/ because Vitest
// collects src/**/*.spec.* only.

import nextConfig from "../next.config";

// Both say "never show this site in a frame", against clickjacking. Browsers
// that know CSP use frame-ancestors; older ones fall back to X-Frame-Options.
// WEB-45 adds the rest of the CSP, HSTS and poweredByHeader.
const FRAME_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

describe("next.config headers()", () => {
  it("adds only the two frame headers, to every path", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers?.();

    // "/:path*" matches "/" and every path below it, /api included. No
    // `has` or `missing`, so no request can slip past the rule.
    expect(rules).toEqual([{ source: "/:path*", headers: FRAME_HEADERS }]);
  });

  it("keeps the static-shell settings it had", () => {
    expect(nextConfig.cacheComponents).toBe(true);
    expect(nextConfig.partialPrefetching).toBe(true);
    expect(nextConfig.reactCompiler).toBe(true);
  });
});
