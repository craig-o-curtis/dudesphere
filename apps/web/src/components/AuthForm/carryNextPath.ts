import type { FormEvent } from "react";

/**
 * With JavaScript on, the form can be submitted before React has moved the
 * streamed `next` field into it. This adds the field from the address bar in
 * that case, for that one submit. A field already in the form always wins. The action still checks
 * the value with safeNextPath(), so this adds no trust. With JavaScript off
 * this never runs, and posting is unchanged.
 */
export function carryNextPath(event: FormEvent<HTMLFormElement>) {
  const form = event.currentTarget;
  if (new FormData(form).has("next")) return;
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "next";
  input.value = next;
  form.append(input);
  // React reads the form data during this same submit. After that the input
  // is not needed, and it must not pile up beside the real field.
  setTimeout(() => input.remove());
}
