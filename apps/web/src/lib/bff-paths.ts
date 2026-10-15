// Which Nest paths the /api/bff proxy may reach. A pure module: no request,
// no token, no network. The Route Handler in app/api/bff/[...path] calls
// bffTarget first, and answers 404 when it gives null.

/**
 * The Nest path prefixes the browser may reach through /api/bff, each as a
 * list of segments. A path is allowed when its first segments equal one of
 * these, segment by segment and case by case, as Nest's routes match. So
 * `users/me` and `users/me/settings` pass, and `users`, `users/1` and
 * `users/me-x` don't.
 *
 * Later stories add their prefixes here. LANE-25 adds `lanes`, once Nest has
 * a lanes controller.
 */
export const BFF_ALLOWED_PREFIXES: readonly (readonly string[])[] = [
  ["abidings"],
  ["hashtags"],
  ["profiles"],
  ["users", "me"],
];

// Characters no segment may hold, after Next has decoded it once:
// "/" and "\" (an encoded slash or backslash), "%" (left over from double
// encoding, such as "%252F"), and the C0 control characters and DEL.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point.
const REFUSED_CHARACTERS = /[/\\%\u0000-\u001f\u007f]/;

function isSafeSegment(segment: string): boolean {
  return segment !== "" && segment !== "." && segment !== ".." && !REFUSED_CHARACTERS.test(segment);
}

function isAllowedPath(segments: readonly string[]): boolean {
  return BFF_ALLOWED_PREFIXES.some(
    (prefix) =>
      segments.length >= prefix.length && prefix.every((part, index) => segments[index] === part),
  );
}

/**
 * The Nest path and query for a /api/bff request, such as
 * "/hashtags?q=dude", or null when the request must be refused.
 *
 * `segments` are the catch-all segments Next gives the Route Handler, each
 * already decoded once. It gives null for any empty, "." or ".." segment, a
 * segment holding "/", "\", "%" or a control character, and any path outside
 * BFF_ALLOWED_PREFIXES. Each segment is encoded again with
 * encodeURIComponent, so nothing in it can change the path's shape at Nest.
 *
 * `search` is the request's query string as given: empty, or starting with
 * "?". Anything else gives null.
 */
export function bffTarget(segments: readonly string[], search: string): string | null {
  if (!segments.every(isSafeSegment) || !isAllowedPath(segments)) {
    return null;
  }
  if (search !== "" && !search.startsWith("?")) {
    return null;
  }
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}${search}`;
}
