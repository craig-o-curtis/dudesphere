import { Suspense } from "react";

import { NextPathField } from "@/components/NextPathField/NextPathField";

/** The hidden `next` field for forms that carry the member on to a page after sign-in. */
export function NextPathSlot() {
  return (
    // Inside Suspense so the `?next=` read does not push the form out of the static shell.
    <Suspense fallback={null}>
      <NextPathField />
    </Suspense>
  );
}
