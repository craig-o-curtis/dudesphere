import { redirect } from "next/navigation";

import { Text } from "@/components/ui/Text/Text";
import { loginHref } from "@/lib/next-path";
import { getMe, requireSession } from "@/lib/session";

/**
 * The placeholder body of `/feed`. It checks the session first, so a visitor
 * with no live session goes to `/login?next=%2Ffeed`. Then it asks Nest who the
 * member is.
 *
 * `requireSession` only reads the cookie, so it cannot tell a forged or ended
 * token from a live one. When Nest answers 401 (`getMe` returns null), the
 * member goes to `/login?next=%2Ffeed` too. No loop: `/login` renders even with
 * that cookie, because proxy only sends unreadable or nearly expired tokens to
 * the refresh handler.
 *
 * "Signed in." with no name is only for a member with no profile or no display
 * name. A Nest outage throws on purpose, so the nearest error boundary handles it.
 *
 * Reading cookies makes this dynamic, so the page wraps it in `<Suspense>`
 * with `<FeedWelcomeSkeleton />` as the fallback.
 */
export async function FeedWelcome() {
  await requireSession("/feed");
  const me = await getMe();
  if (!me) redirect(loginHref("/feed"));
  const name = me.profile?.displayName;
  return <Text>{name ? `Signed in as ${name}.` : "Signed in."}</Text>;
}

/** The fallback: the same `<Text>` box with a non-breaking space, so one line of height holds. */
export function FeedWelcomeSkeleton() {
  return <Text aria-hidden="true">{" "}</Text>;
}
