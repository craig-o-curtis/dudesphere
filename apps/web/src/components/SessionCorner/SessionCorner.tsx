import Link from "next/link";

import { readSessionCookies } from "@/lib/session";

import styles from "./SessionCorner.module.css";

/** The one query value the corner reads. The page passes its `searchParams` promise. */
export interface SignoutParams {
  signout?: string | string[];
}

/**
 * The session corner on `/`. Signed out it links to sign in and sign up.
 * Signed in it says so and offers two plain HTML forms that post to the logout
 * handlers, so sign-out works with JavaScript off. No token is ever rendered.
 *
 * `/?signout=partial` means Nest could not sign out the other devices, and
 * `/?signout=ended` means this sign-in had already ended. Signed out, the
 * corner then says so in an `<output>` line. Any other value shows nothing.
 *
 * Reading cookies makes this dynamic, so the page wraps it in `<Suspense>` with
 * `<SessionCornerSkeleton />` as the fallback.
 */
export async function SessionCorner({ searchParams }: { searchParams: Promise<SignoutParams> }) {
  const [{ accessToken }, { signout }] = await Promise.all([readSessionCookies(), searchParams]);

  if (accessToken === null) {
    return <SignedOutLinks notice={noticeFor(signout)} />;
  }

  return (
    <div className={styles.corner} data-session-corner>
      <p className={styles.status}>You&apos;re signed in.</p>
      <div className={styles.forms}>
        <form method="post" action="/api/auth/logout" className={styles.form}>
          <button type="submit" className={styles.button}>
            Sign out
          </button>
        </form>
        <form method="post" action="/api/auth/logout-everywhere" className={styles.form}>
          <button
            type="submit"
            className={styles.button}
            aria-describedby="sign-out-everywhere-hint"
          >
            Sign out everywhere
          </button>
          <p id="sign-out-everywhere-hint" className={styles.hint}>
            Signs you out on every device.
          </p>
        </form>
      </div>
    </div>
  );
}

const NOTICES = {
  partial:
    "You're signed out here, but we couldn't reach your other devices. Sign in and try Sign out everywhere again.",
  ended:
    "This sign-in had already ended, so you're signed out here. To be sure your other devices are signed out, sign in and press Sign out everywhere.",
} as const;

function noticeFor(signout: string | string[] | undefined): string | null {
  return signout === "partial" || signout === "ended" ? NOTICES[signout] : null;
}

function SignedOutLinks({ notice = null }: { notice?: string | null }) {
  return (
    <div className={styles.corner} data-session-corner>
      {notice ? <output className={styles.status}>{notice}</output> : null}
      <Link href="/login" className={styles.link}>
        Sign in
      </Link>
      <Link href="/signup" className={styles.link}>
        Sign up
      </Link>
    </div>
  );
}

/**
 * The fallback, and the view with JavaScript off: the signed-out links at the
 * same size, so the corner does not jump when the real one streams in.
 */
export function SessionCornerSkeleton() {
  return <SignedOutLinks />;
}
