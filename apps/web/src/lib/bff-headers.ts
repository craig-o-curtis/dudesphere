import "server-only";
import { isIP } from "node:net";

// The header pair that tells Nest who the visitor is (API-10). Every call from
// this app to Nest comes from the web server, so on its own Nest would count
// every member's rate limits against the web server's one address.
// X-Client-Ip carries the visitor's address, and X-Bff-Secret proves this
// app sent it. Nest trusts X-Client-Ip only when the secret matches its own
// BFF_SECRET.
//
// BFF_SECRET is server-only. It never goes in a NEXT_PUBLIC_ variable, and
// this module imports server-only, so a client bundle that imports it fails
// to build.
//
// The address is only as honest as the host. Vercel sets x-real-ip and
// x-forwarded-for itself and overwrites what the visitor sent. Off Vercel
// (`next dev`, a self-hosted `next start`), a visitor can send their own
// x-real-ip or x-forwarded-for, and it is passed on. x-real-ip is read
// first, so a proxy that rewrites x-forwarded-for but leaves x-real-ip alone
// does not close the gap. That is an accepted limit.

// The rule Nest checks BFF_SECRET against at startup
// (apps/api/src/config/env.validate.ts): 32 or more letters, digits or
// + / = _ -, so base64, base64url and hex all fit. Every one of those is safe
// in a header value. A CR or LF would make `new Headers()` throw with the
// whole secret in its message. (A NUL can't get this far: process.env cuts a
// value at its first NUL.)
const HEADER_SAFE_SECRET = /^[A-Za-z0-9+/=_-]{32,}$/;

/** The two headers bffHeadersFrom sets. apiFetch removes any others by these names. */
export const BFF_HEADER_NAMES = ["X-Bff-Secret", "X-Client-Ip"] as const;

/** Both headers, or neither. Never one without the other. */
export type BffHeaders = { "X-Bff-Secret": string; "X-Client-Ip": string } | Record<string, never>;

/** The one method this module reads: `headers()` and `request.headers` both have it. */
type IncomingHeaders = Pick<Headers, "get">;

/**
 * The visitor's IP address from the incoming request, or null when there is
 * no valid one.
 *
 * Reads x-real-ip, then the first x-forwarded-for entry. The first of the two
 * with any text in it is the one used, trimmed. It is kept only when
 * `net.isIP` accepts it, so text such as `1.2.3.4|x`, a port or brackets
 * never reaches Nest. An x-real-ip that isn't an address gives null. It
 * doesn't fall back to x-forwarded-for, so one request never mixes two
 * sources.
 */
export function clientIpOf(headers: IncomingHeaders): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  const candidate = realIp || firstForwardedFor(headers);
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

/**
 * The headers to add to a call to Nest: X-Bff-Secret from BFF_SECRET, and
 * X-Client-Ip from clientIpOf. Gives {} when BFF_SECRET is unset or empty,
 * when it breaks Nest's rule (too short, or a character outside
 * A-Z a-z 0-9 + / = _ -), or when the request has no valid address. A bad
 * secret is never sent or logged, so it can't reach an error message. Dev
 * works without BFF_SECRET: Nest then counts the web server's address, as
 * before API-10.
 */
export function bffHeadersFrom(headers: IncomingHeaders): BffHeaders {
  const secret = process.env.BFF_SECRET;
  if (!secret || !HEADER_SAFE_SECRET.test(secret)) {
    return {};
  }
  const clientIp = clientIpOf(headers);
  if (clientIp === null) {
    return {};
  }
  return { "X-Bff-Secret": secret, "X-Client-Ip": clientIp };
}

// The first comma-separated entry, trimmed: the address the first proxy saw.
function firstForwardedFor(headers: IncomingHeaders): string | undefined {
  return headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
}
