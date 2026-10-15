"use client";

import { Suspense } from "react";
import type { FormEvent, ReactNode } from "react";

import { CookieNote } from "@/components/CookieNote/CookieNote";
import { NextPathField } from "@/components/NextPathField/NextPathField";
import type { AuthFieldErrors } from "@/lib/actions/auth-state";

import { Button } from "../ui/Button/Button";
import { Form } from "../ui/Form/Form";
import { FormAlert } from "../ui/FormAlert/FormAlert";
import { Stack } from "../ui/Stack/Stack";
import { Text } from "../ui/Text/Text";

import styles from "./AuthForm.module.css";

type AuthFormProps = {
  action: (formData: FormData) => void;
  /** Pass `state.fieldErrors`. A new object each time moves focus to the first invalid field. */
  fieldErrors: AuthFieldErrors;
  /** The message for the whole form, with any link it needs. Nothing shows when empty. */
  formError: ReactNode;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  /** The line under the form that points to the other page. */
  alt: ReactNode;
  /** The fields, in order. */
  children: ReactNode;
};

/**
 * With JavaScript on, the form can be submitted before React has moved the
 * streamed `next` field into it. This adds the field from the address bar in
 * that case, for that one submit. A field already in the form always wins. The action still checks
 * the value with safeNextPath(), so this adds no trust. With JavaScript off
 * this never runs, and posting is unchanged.
 */
function carryNextPath(event: FormEvent<HTMLFormElement>) {
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

/** The frame the sign-in and sign-up forms share. */
export function AuthForm({
  action,
  fieldErrors,
  formError,
  pending,
  submitLabel,
  pendingLabel,
  alt,
  children,
}: AuthFormProps) {
  return (
    <Stack className={styles.root}>
      <Form action={action} errors={fieldErrors} onSubmit={carryNextPath}>
        <FormAlert>{formError}</FormAlert>
        {children}
        {/* Inside Suspense so the `?next=` read does not push the form out of the static shell. */}
        <Suspense fallback={null}>
          <NextPathField />
        </Suspense>
        <Button variant="primary" type="submit" pending={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </Form>
      <Text>{alt}</Text>
      <CookieNote />
    </Stack>
  );
}
