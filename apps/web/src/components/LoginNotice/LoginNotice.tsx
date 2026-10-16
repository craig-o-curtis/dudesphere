import { FocusedNotice } from "./FocusedNotice";

/** The one query value the notice reads. The page passes its `searchParams` promise. */
export interface ResetParams {
  reset?: string | string[];
}

/**
 * `/login?reset=1` is where a password change lands. Only `1` shows the
 * notice. Any other value, or none, shows nothing. It reads request data, so
 * the page wraps it in `<Suspense>` and the sign-in form stays in the static shell.
 * The notice takes focus when it shows (see FocusedNotice).
 */
export async function LoginNotice({ searchParams }: { searchParams: Promise<ResetParams> }) {
  const { reset } = await searchParams;
  return reset === "1" ? (
    <FocusedNotice>Password changed. Roll in with the new one.</FocusedNotice>
  ) : null;
}
