import { getUnixNow } from "@northguild/gmt";

// Reads an access token's claims without checking it: when it was issued and
// when it runs out, and which sign-in it belongs to. proxy.ts uses the times
// to decide whether to refresh, lib/session.ts uses `exp` to treat an
// expired token as no session, and the /api/auth routes use `sid` to tie a
// refresh cookie to the session cookie. Nest checks the signature on every
// call, so a forged claim gets past here and then fails there.
//
// It must stay pure and free of `server-only`, because proxy.ts imports it.
// It uses atob and TextDecoder, not Buffer, so it runs in any JavaScript
// runtime.

// A JWT: three base64url parts, the last one (the signature) possibly empty.
// The same shape lib/session.ts accepts. The payload part is captured.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*$/;

// Turns base64url into UTF-8 text. Bad base64 or bytes that aren't UTF-8
// give null.
function decodeBase64Url(segment: string): string | null {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

// The token's payload as a JSON object, read with no signature check, or
// null when the token isn't shaped like a JWT or its payload isn't base64url
// JSON.
function readPayload(token: string): Record<string, unknown> | null {
  if (typeof token !== "string") {
    return null;
  }

  const payloadPart = JWT_SHAPE.exec(token)?.[1];
  if (payloadPart === undefined) {
    return null;
  }

  const text = decodeBase64Url(payloadPart);
  return text === null ? null : parseJsonObject(text);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** When a token was issued and when it runs out, in epoch seconds. */
export interface TokenTimes {
  exp: number;
  /**
   * When the token was issued, or null when the payload has no usable `iat`:
   * missing, not a finite number, or not before `exp`. Such an `iat` says
   * nothing about how long the token lives.
   */
  iat: number | null;
}

/**
 * Returns the token's `exp` and `iat`, read from its payload with no
 * signature check. Returns null when the token isn't shaped like a JWT, its
 * payload isn't base64url JSON, or `exp` isn't a finite number. A bad `iat`
 * alone gives `iat: null`, not null.
 */
export function readTokenTimes(token: string): TokenTimes | null {
  const payload = readPayload(token);
  const exp = payload?.exp;
  if (!isFiniteNumber(exp)) {
    return null;
  }

  const iat = payload?.iat;
  return { exp, iat: isFiniteNumber(iat) && iat < exp ? iat : null };
}

/**
 * Returns the token's `exp`, in epoch seconds, read from its payload with no
 * signature check. Returns null when the token isn't shaped like a JWT, its
 * payload isn't base64url JSON, or `exp` isn't a finite number.
 */
export function readTokenExp(token: string): number | null {
  return readTokenTimes(token)?.exp ?? null;
}

/**
 * Returns the token's `sid`, the id of the sign-in it belongs to, read from
 * its payload with no signature check. Returns null when the token isn't
 * shaped like a JWT, its payload isn't base64url JSON, or `sid` isn't a
 * non-empty string. Nest keeps the same `sid` through every refresh of a
 * sign-in, and gives each new sign-in a new one.
 */
export function readTokenSid(token: string): string | null {
  const sid = readPayload(token)?.sid;
  return typeof sid === "string" && sid.length > 0 ? sid : null;
}

/**
 * True when both access tokens carry the same `sid`: they belong to one
 * sign-in. False when either is missing, unreadable or has no `sid`.
 *
 * The /api/auth routes use it to tie a refresh cookie to the session cookie
 * it came with. A sibling subdomain can plant a `__Secure-refresh` cookie,
 * but never a `__Host-session` one, so a fresh pair whose `sid` differs from
 * the session cookie's came from someone else's refresh token. Neither
 * signature is checked here; the session cookie's `sid` only has to be the
 * one this browser was given.
 */
export function sameSignIn(first: string | null, second: string | null): boolean {
  if (first === null || second === null) {
    return false;
  }
  const sid = readTokenSid(first);
  return sid !== null && sid === readTokenSid(second);
}

/**
 * True when `exp` is `seconds` or fewer from now, or already past. The
 * current time comes from gmt. When gmt can't give it, or `exp` isn't a
 * finite number, the answer is true, so the caller treats the token as
 * running out rather than trusting it.
 */
export function expiresWithin(exp: number, seconds: number): boolean {
  const now = getUnixNow({ epochUnit: "seconds" });
  if (now === null || !Number.isFinite(exp)) {
    return true;
  }
  return exp - now <= seconds;
}
