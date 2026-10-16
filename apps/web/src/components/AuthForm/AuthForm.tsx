"use client";

import type { FormEvent, ReactNode } from "react";

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
  /** Runs on submit, before the action. Optional. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Anything that goes under the "alt" line, such as a note. Optional. */
  footer?: ReactNode;
  /** The fields, in order, with any hidden fields after them. */
  children: ReactNode;
};

/** The plain frame the auth forms share. It adds nothing about `next` or cookies. */
export function AuthForm({
  action,
  fieldErrors,
  formError,
  pending,
  submitLabel,
  pendingLabel,
  alt,
  onSubmit,
  footer,
  children,
}: AuthFormProps) {
  return (
    <Stack className={styles.root}>
      <Form action={action} errors={fieldErrors} onSubmit={onSubmit}>
        <FormAlert>{formError}</FormAlert>
        <Text as="p" tone="muted" size="sm">
          All fields are required.
        </Text>
        {children}
        <Button variant="primary" type="submit" pending={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </Form>
      <Text>{alt}</Text>
      {footer}
    </Stack>
  );
}
