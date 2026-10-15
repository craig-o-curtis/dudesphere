import { loginHref } from "@/lib/next-path";

// How Client Components call Nest: through the /api/bff proxy, which adds
// the member's Bearer on the server. The browser never sees a token.
//
// When the access token runs out, the proxy answers 401. Then clientFetch
// asks POST /api/auth/refresh for a fresh pair, which the server saves in the
// cookies, and tries once more. Every call in the tab that gets a 401 at the
// same time shares one refresh, because a refresh token works only once.
//
// It runs in the browser only. TanStack Query calls it for client lists.

const BFF_PREFIX = "/api/bff/";
const REFRESH_PATH = "/api/auth/refresh";

// A made-up origin to parse against. If parsing moves the URL off it, or off
// the BFF prefix, the path tried to point somewhere else.
const BASE = "http://client-fetch.invalid";

/**
 * "refreshed": the server saved a fresh pair (204), so a retry can work.
 * "signed-out": the sign-in is over (401), so the member must sign in again.
 * "unavailable": anything else, a network failure included. Nest may be
 * down, so the caller gets its original 401 and no redirect.
 */
type RefreshOutcome = "refreshed" | "signed-out" | "unavailable";

// The tab's one refresh in flight, or null. Cleared once it settles, so a
// 401 minutes later can refresh again.
let refreshing: Promise<RefreshOutcome> | null = null;

/**
 * Calls Nest through `/api/bff/<path>` with the caller's `init`, and answers
 * the Response as it came, whatever its status.
 *
 * On a 401 it refreshes once, through the tab's shared refresh, and retries
 * once. A 401 after the retry, or a 401 from the refresh, sends the browser
 * to sign-in with `next` set to the current path and query; the 401 Response
 * still comes back while the page leaves. When the refresh can't be done for
 * any other reason, the caller gets the original 401, with no redirect.
 *
 * `path` is a Nest path such as "hashtags?q=dude" or "/users/me", with or
 * without the leading "/". It throws a TypeError, before any request, for an
 * empty path, an absolute or protocol-relative URL, a backslash, and an
 * empty, "." or ".." segment, encoded or not.
 *
 * The body may be sent twice, so it must be one fetch can replay: a string,
 * FormData, URLSearchParams, a Blob or a buffer. A ReadableStream throws a
 * TypeError. `credentials` is always "same-origin". The caller's signal goes
 * to both BFF calls, but not to the shared refresh, which other calls may be
 * waiting on.
 */
export async function clientFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = bffUrl(path);
  if (init.body instanceof ReadableStream) {
    throw new TypeError(
      "clientFetch can't send a stream body: it can't be sent again after a refresh.",
    );
  }
  const request: RequestInit = { ...init, credentials: "same-origin" };

  const first = await fetch(url, request);
  if (first.status !== 401) {
    return first;
  }

  const outcome = await refreshSession();
  if (outcome === "unavailable") {
    return first;
  }
  if (outcome === "signed-out") {
    goToSignIn();
    return first;
  }

  const retried = await fetch(url, request);
  if (retried.status === 401) {
    goToSignIn();
  }
  return retried;
}

// The same-origin URL for a Nest path, such as "/api/bff/hashtags?q=dude".
function bffUrl(path: string): string {
  const relative = path.startsWith("/") ? path.slice(1) : path;
  const [pathPart = ""] = relative.split(/[?#]/, 1);

  if (pathPart === "" || relative.startsWith("/") || relative.includes("\\")) {
    throw refusedPath(path);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathPart) || !pathPart.split("/").every(isSafeSegment)) {
    throw refusedPath(path);
  }

  // Belt and braces: the browser's own parser must agree that the URL stays
  // on this origin and under the BFF prefix.
  const url = `${BFF_PREFIX}${relative}`;
  const parsed = new URL(url, BASE);
  if (parsed.origin !== BASE || !parsed.pathname.startsWith(BFF_PREFIX)) {
    throw refusedPath(path);
  }
  return url;
}

// The browser's URL parser treats "%2e" as "." too, so an encoded dot
// segment would climb out of /api/bff just like a plain one.
function isSafeSegment(segment: string): boolean {
  if (segment === "") {
    return false;
  }
  const dots = segment.replace(/%2e/gi, ".");
  return dots !== "." && dots !== "..";
}

function refusedPath(path: string): TypeError {
  return new TypeError(
    `clientFetch path must be a Nest path under /api/bff. Got ${JSON.stringify(path)}.`,
  );
}

// Joins the refresh in flight, or starts one.
function refreshSession(): Promise<RefreshOutcome> {
  refreshing ??= askToRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Resolves to an outcome and never rejects, so every call waiting on it
// gets an answer.
async function askToRefresh(): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await fetch(REFRESH_PATH, { method: "POST", credentials: "same-origin" });
  } catch {
    return "unavailable";
  }
  if (response.ok) {
    return "refreshed";
  }
  return response.status === 401 ? "signed-out" : "unavailable";
}

// A full page load to sign-in, so the server renders it fresh. `next` brings
// the member back here; loginHref gives plain "/login" for "/".
function goToSignIn(): void {
  const { pathname, search } = window.location;
  window.location.assign(loginHref(`${pathname}${search}`));
}
