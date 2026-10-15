// Picks where to send a member after sign-in, from a `next` value the client
// sent. Only a same-origin path outside `/api` survives. Everything else,
// including anything odd, becomes "/". It is pure, so client and server code,
// and AUTH-8's refresh handler, can all use it.

const FALLBACK = "/";

// A made-up origin to parse against. If parsing moves the value off it, the
// value named another origin.
const BASE = new URL("http://next-path.invalid");

/** The longest `next` value we accept, in UTF-16 code units. */
export const MAX_NEXT_PATH_LENGTH = 2048;

// C0 controls, DEL and C1 controls. `URL` strips tabs and newlines without a
// word, which turns "/\t/evil" into "//evil", so these go before parsing.
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

// Decodes the path once, as Next's router does. A broken escape gives null.
function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isUnderApi(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower === "/api" || lower.startsWith("/api/");
}

function hasDotSegment(pathname: string): boolean {
  return pathname.split("/").some((segment) => segment === "." || segment === "..");
}

// Checks the path as a server would see it after one decode. Anything still
// encoded after that, such as "%252F", is refused rather than guessed at.
function isSafeDecodedPath(decoded: string): boolean {
  return (
    !decoded.includes("%") &&
    !decoded.includes("\\") &&
    !decoded.includes("//") &&
    !hasControlCharacter(decoded) &&
    !hasDotSegment(decoded) &&
    !isUnderApi(decoded)
  );
}

/**
 * Returns the path, query and hash of `value` when it is a same-origin path
 * that starts with a single "/" and is not under `/api`. Returns "/" for
 * anything else.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NEXT_PATH_LENGTH) {
    return FALLBACK;
  }
  if (hasControlCharacter(value) || value.includes("\\")) {
    return FALLBACK;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return FALLBACK;
  }

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE.origin) {
    return FALLBACK;
  }

  const decoded = decodePath(url.pathname);
  if (decoded === null || !isSafeDecodedPath(decoded)) {
    return FALLBACK;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
