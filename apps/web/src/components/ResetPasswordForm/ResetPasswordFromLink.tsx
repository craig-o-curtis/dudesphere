import { ResetPasswordForm } from "./ResetPasswordForm";

export interface ResetPasswordParams {
  token?: string | string[];
}

/**
 * Reads `?token=` on the server and hands it to the form as a prop. It reads
 * request data, so the page wraps it in `<Suspense>`. A repeated or empty
 * `token` counts as missing.
 */
export async function ResetPasswordFromLink({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordParams>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" && token !== "" ? token : null} />;
}
