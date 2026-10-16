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

// The reset page's URL holds the token from the email (AUTH-9). strict-origin
// sends only the origin in a Referer, never the path or the query, so a link
// or a resource on the page can't carry the token to another site. Not
// no-referrer: it makes a plain HTML form post send `Origin: null`, and Next
// refuses the Server Action.
const ORIGIN_ONLY_REFERRER = [{ key: "Referrer-Policy", value: "strict-origin" }];

describe("next.config headers()", () => {
  it("adds the two frame headers to every path, and an origin-only Referer to /reset-password", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers?.();

    // "/:path*" matches "/" and every path below it, /api included. No
    // `has` or `missing`, so no request can slip past either rule. Matching
    // ignores the query string, so "/reset-password" covers "?token=".
    expect(rules).toEqual([
      { source: "/:path*", headers: FRAME_HEADERS },
      { source: "/reset-password", headers: ORIGIN_ONLY_REFERRER },
    ]);
  });

  it("sets Referrer-Policy on /reset-password only, and no rule overrides the frame headers", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];

    const withReferrerPolicy = rules.filter((rule) =>
      rule.headers.some((header) => header.key === "Referrer-Policy"),
    );
    expect(withReferrerPolicy.map((rule) => rule.source)).toEqual(["/reset-password"]);

    // A later rule wins for the same key, so only the "/:path*" rule may set these.
    const frameKeys = new Set(FRAME_HEADERS.map((header) => header.key));
    const settingFrameKeys = rules.filter((rule) =>
      rule.headers.some((header) => frameKeys.has(header.key)),
    );
    expect(settingFrameKeys.map((rule) => rule.source)).toEqual(["/:path*"]);
  });

  it("keeps the static-shell settings it had", () => {
    expect(nextConfig.cacheComponents).toBe(true);
    expect(nextConfig.partialPrefetching).toBe(true);
    expect(nextConfig.reactCompiler).toBe(true);
  });
});
