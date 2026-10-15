"use client";

import { useSearchParams } from "next/navigation";

// Carries the `?next=` query value into the sign-in and sign-up forms as a
// hidden input. The server action checks it again with safeNextPath(), so the
// value here is never trusted. useSearchParams() makes this a request-time
// read, so the page puts it inside <Suspense> and the rest stays static.
export function NextPathField() {
  const next = useSearchParams().get("next");
  if (!next) return null;
  return <input type="hidden" name="next" value={next} />;
}
