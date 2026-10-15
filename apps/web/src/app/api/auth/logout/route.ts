import "server-only";
import { apiFetch } from "@/lib/api";
import { assertSameOrigin } from "@/lib/origin";
import { logFailure, seeOtherToHome } from "@/lib/route-responses";
import { clearSessionCookies, readSessionCookies } from "@/lib/session";

// Sign out on this device. The "Sign out" button is a plain
// <form method="post" action="/api/auth/logout">, so it works with
// JavaScript off. It is a Route Handler, not a Server Action, because the
// refresh cookie is sent only to paths under /api/auth, and a Server Action
// posts to the page's own path.
//
// Only POST is exported. Next answers 405 to every other method.

/**
 * Checks the Origin, asks Nest to end this device's sign-in, clears both
 * cookies, and sends the browser to "/" with a 303, so it follows with a GET.
 *
 * Nest's answer doesn't change the outcome. Once the member asks to sign
 * out, the cookies go, whether or not Nest could be reached.
 */
export async function POST(request: Request): Promise<Response> {
  // Next checks Origin on Server Actions only. Without this, any site could
  // post a form here and sign the member out.
  if (!assertSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const { refreshToken } = await readSessionCookies();
  if (refreshToken) {
    try {
      // Ends the token's whole sign-in at Nest. Nest answers 204 for an
      // unknown token too, so a token that already ran out is no error.
      await apiFetch<void>("/auth/token/revoke", {
        method: "POST",
        body: { refreshToken },
      });
    } catch (error) {
      logFailure("Sign out", error);
    }
  }

  await clearSessionCookies();
  return seeOtherToHome();
}
