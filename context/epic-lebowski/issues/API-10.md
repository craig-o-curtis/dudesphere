# API-10: Trust the BFF's client IP for rate limits

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 0. Blocked by: none.

**Scope:** When a request carries an `X-Bff-Secret` header equal to the new `BFF_SECRET` env var, `AuthThrottlerGuard` counts it by the IP address in `X-Client-Ip`; without a match it ignores that header and counts the caller's own address, as today.

## Gap

Nest's throttler counts the caller's IP address. Behind the BFF, every request comes from the Next server, and on Vercel from Vercel's addresses. So the limit of 100 a minute would be shared by every member, and 5 sign-in tries in 15 minutes would be shared by everyone typing the same identifier from anywhere. One busy minute would lock everyone out. `main.ts` sets `trust proxy` to `loopback`, which does not help: Vercel is not on the same machine.

## Scope

- `apps/api/src/config/env.validate.ts`: new optional `BFF_SECRET`, at least 32 characters when set, all letters, digits or `+ / = _ -` (header-safe: base64, base64url and hex fit). Unset means the header is never trusted.
- `apps/api/.env.example`: `BFF_SECRET=` with a comment: "Shared with apps/web. Lets Nest count rate limits by the visitor's IP, not the web server's."
- `apps/api/src/auth/auth-throttler.guard.ts`, `getTracker(req)`:
  - Read `x-bff-secret`. Compare it to `BFF_SECRET` with `crypto.timingSafeEqual` on equal-length buffers.
  - On a match, read `x-client-ip`. Accept it only if it parses as an IPv4 or IPv6 address (`net.isIP(value) !== 0`). Use it as the IP. Like a direct caller's address, an IPv6 address is counted by its /64, and `::ffff:a.b.c.d` as `a.b.c.d`.
  - Otherwise use `super.getTracker(req)`, as today.
  - The account part is unchanged: `${account}|${ip}` where the body names an account.
- The `ip` throttler count (`IP_THROTTLER`) uses the same IP choice.
- New `apps/web/src/lib/bff-headers.ts` (`server-only`) builds the header pair in one place:
  - `clientIpOf(headers)` reads `x-real-ip`, then the first address in `x-forwarded-for`, and keeps it only if `net.isIP` accepts it. Vercel sets both headers and overwrites what the visitor sent. `next dev` fills `x-forwarded-for` with the socket address when it is missing.
  - `bffHeadersFrom(headers)` returns `X-Bff-Secret: process.env.BFF_SECRET` and `X-Client-Ip`, or nothing when the secret is unset, too short or holds a character outside `A-Z a-z 0-9 + / = _ -`, or when there is no valid IP. It never sends one header without the other.
- `apiFetch` in `apps/web/src/lib/api.ts` (AUTH-7) adds the pair itself, from `headers()` in `next/headers`, after any `extraHeaders`, so a caller can't replace it. Every `apiFetch` call gets it with no caller change: the Server Actions, `getMe`, `refreshOnce` and the `/api/auth` handlers.
- AUTH-8's `/api/bff/[...path]` route calls Nest with its own `fetch`. It adds `bffHeadersFrom(request.headers)`.
- `apps/web/.env.example` gains `BFF_SECRET=`.
- `context/overview.md`, "Rate limits": a paragraph on the header pair.

## Design notes

- **A shared secret, not an IP allow-list.** Vercel's egress addresses are not fixed. A secret works on any host.
- **Constant-time compare.** A plain `===` would leak the secret's prefix through timing.
- **A wrong or missing secret falls back silently.** It does not answer 401. A browser that forges `X-Client-Ip` without the secret is counted by its own address, which is what happens today.
- **The secret is server-only on the web side.** It is never in a `NEXT_PUBLIC_` variable, and `lib/api.ts` imports `server-only`.
- **Accepted limit: the IP is only as honest as the host.** On Vercel it is. Off Vercel (`next dev`, a self-hosted `next start`), a visitor can send their own `X-Real-Ip` or `X-Forwarded-For`, and the BFF passes it on. `X-Real-Ip` is read first, so a proxy that rewrites `X-Forwarded-For` but leaves `X-Real-Ip` alone does not close the gap. A host that adds to `X-Forwarded-For` instead of overwriting it, such as Cloudflare, needs `clientIpOf` to read its own header (`CF-Connecting-IP`).
- **Validate the address.** A forged value with the secret (a leaked secret) still cannot inject a tracker key with `|` or other text.

## Verification

Unit, `auth-throttler.guard.spec.ts`:

- Secret matches, `X-Client-Ip: 203.0.113.7`: tracker is `203.0.113.7`.
- Secret matches, body names `walter`: tracker is `walter|203.0.113.7`.
- Secret matches, `X-Client-Ip: not-an-ip`: tracker is the socket address.
- Secret wrong: tracker is the socket address.
- `BFF_SECRET` unset, header present: tracker is the socket address.
- Secret of a different length: no exception, falls back.

E2E, `rate-limit.e2e-spec.ts` with `THROTTLE_ENABLED` on for that suite, as today:

- Six `POST /auth/token` with the secret and `X-Client-Ip: 198.51.100.1`, then one with `X-Client-Ip: 198.51.100.2`: the sixth gets 429, the seventh gets 401 (wrong password), not 429.
- The same seven requests with no secret: the seventh gets 429.

## Done when

- [ ] `BFF_SECRET` validated in `env.validate.ts` and listed in `.env.example`
- [ ] `AuthThrottlerGuard.getTracker` reads the header pair as above
- [ ] Unit and e2e specs as listed
- [ ] `apiFetch` and the `/api/bff` route send both headers, from `lib/bff-headers.ts`
- [ ] `context/overview.md` "Rate limits" updated
