// The Origin check for Route Handlers. Next checks Origin on Server Actions
// only, so each `/api/auth` handler calls this itself.
//
// It follows Next's Server Action check (`parseHostHeader` in
// next/dist/server/app-render/action-handler.js): the host of the Origin
// header must equal the first `x-forwarded-host` value, or else `host`.
// Next's server fills in `x-forwarded-host` from `host` when it is missing.
// Unlike Next, a missing Origin fails here, and so does any Origin that is
// not a plain http or https origin.

// The first entry of `x-forwarded-host`, or else `host`, in lower case.
function requestHost(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host")?.trim();
  return host ? host.toLowerCase() : null;
}

// The host of an Origin header, only when the header is exactly a serialized
// http or https origin, as browsers send it. "null" and anything else give null.
function originHost(origin: string | null): string | null {
  if (!origin || origin.toLowerCase() === "null") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.origin !== origin.toLowerCase()) {
    return null;
  }
  return url.host;
}

/**
 * True only when the request's Origin header names this app's own host. A
 * missing Origin, or "null", is false.
 */
export function assertSameOrigin(request: Request): boolean {
  const fromOrigin = originHost(request.headers.get("origin"));
  const fromRequest = requestHost(request.headers);
  return fromOrigin !== null && fromRequest !== null && fromOrigin === fromRequest;
}
