import { useId } from "react";

import { Button } from "@/components/ui/Button/Button";
import { ButtonLink } from "@/components/ui/ButtonLink/ButtonLink";
import { Cluster } from "@/components/ui/Cluster/Cluster";
import { Notice } from "@/components/ui/Notice/Notice";
import { Text } from "@/components/ui/Text/Text";
import { verifySession } from "@/lib/session";

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
 * `/?signout=partial` means a sign-out, from either button, could not confirm
 * that every sign-in ended, and
 * `/?signout=ended` means this sign-in had already ended. Signed out, the
 * corner then says so in an `<output>` line. Any other value shows nothing.
 *
 * It asks `verifySession()`, which reads cookies, so a cookie holding an
 * expired token counts as signed out. That makes this dynamic, so the page wraps it in `<Suspense>` with
 * `<SessionCornerSkeleton />` as the fallback.
 */
export async function SessionCorner({ searchParams }: { searchParams: Promise<SignoutParams> }) {
  const [session, { signout }] = await Promise.all([verifySession(), searchParams]);

  if (session === null) {
    return <SignedOutLinks notice={noticeFor(signout)} />;
  }

  return (
    <Cluster gap={3} columnGap={4} justify="center" className={styles.corner} data-session-corner>
      <Text>You&apos;re signed in.</Text>
      <Cluster gap={3} columnGap={4} align="start" justify="center">
        <form method="post" action="/api/auth/logout" className={styles.form}>
          <Button type="submit">Sign out</Button>
        </form>
        <SignOutEverywhereForm />
      </Cluster>
    </Cluster>
  );
}

/** Its own component so `useId` gives each corner on a page its own hint id. */
function SignOutEverywhereForm() {
  const hintId = useId();
  return (
    <form method="post" action="/api/auth/logout-everywhere" className={styles.form}>
      <Button type="submit" aria-describedby={hintId}>
        Sign out everywhere
      </Button>
      <Text id={hintId} tone="muted" size="sm">
        Signs you out on every device.
      </Text>
    </form>
  );
}

const NOTICES = {
  partial:
    "You're signed out here, but we couldn't confirm every sign-in ended. Sign in and press Sign out everywhere to be sure.",
  ended:
    "This sign-in had already ended, so you're signed out here. To be sure your other devices are signed out, sign in and press Sign out everywhere.",
} as const;

function noticeFor(signout: string | string[] | undefined): string | null {
  return signout === "partial" || signout === "ended" ? NOTICES[signout] : null;
}

function SignedOutLinks({ notice = null }: { notice?: string | null }) {
  return (
    <Cluster gap={3} columnGap={4} justify="center" className={styles.corner} data-session-corner>
      {notice ? <Notice>{notice}</Notice> : null}
      <ButtonLink href="/login" variant="quiet">
        Sign in
      </ButtonLink>
      <ButtonLink href="/signup" variant="quiet">
        Sign up
      </ButtonLink>
    </Cluster>
  );
}

/**
 * The fallback, and the view with JavaScript off: the signed-out links at the
 * same size, so the corner does not jump when the real one streams in.
 */
export function SessionCornerSkeleton() {
  return <SignedOutLinks />;
}
