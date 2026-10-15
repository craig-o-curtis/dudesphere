import "server-only";
import { ApiRequestError } from "@/lib/api";
import { safeNextPath } from "@/lib/next-path";

// Small pieces the /api/auth Route Handlers share. They live here because a
// route.ts file may export only its HTTP methods and route config.

/**
 * A 303 to `path`, so the browser follows a form POST with a GET.
 *
 * `path` goes through safeNextPath first, so the Location is always a
 * same-origin path that starts with a single "/" and is not under /api.
 * Anything else, such as "//evil.example.com", becomes "/". The query and
 * hash are kept, as in "/?signout=partial".
 *
 * The relative Location is built by hand: NextResponse.redirect takes only an
 * absolute URL (validateURL in next/dist/server/web/utils.js). Next still
 * copies the cookies set through cookies() onto this Response
 * (appendMutableCookies in next/dist/server/route-modules/app-route/module.js,
 * after the handler returns).
 */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: safeNextPath(path) } });
}

/** A 303 to "/". The same as `seeOther("/")`. */
export function seeOtherToHome(): Response {
  return seeOther("/");
}

/**
 * Logs which call to the API failed and how, and never a token.
 *
 * An ApiRequestError's message names only the method, path and status, so it
 * is logged as a warning: Nest failed or was out of reach. Any other error is
 * a bug in the app's setup, such as API_URL unset, so it is logged as an
 * error. Neither logs Nest's error body or the error's cause.
 */
export function logFailure(label: string, error: unknown): void {
  if (error instanceof ApiRequestError) {
    console.warn(`${label}: ${error.message}.`);
    return;
  }
  const detail = error instanceof Error ? error.message : "an unknown error.";
  console.error(`${label}: could not call the API: ${detail}`);
}
