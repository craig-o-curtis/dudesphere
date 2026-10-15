"use client";

import { createContext, useEffect, useRef } from "react";
import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";
import { mergeRefs } from "@/lib/merge-refs";

import styles from "./Form.module.css";

/** Messages for each field name, as one string or a list. Matches `AuthFieldErrors`. */
export type FormErrors = Partial<Record<string, string | string[]>>;

/**
 * The form's errors, for field parts to read with `use(FormErrorsContext)`.
 * It is `undefined` outside a `Form`, or in a `Form` with no `errors` prop.
 * The object changes identity each time a new set of errors arrives, so a
 * field can use it to know when to show errors again.
 */
export const FormErrorsContext = createContext<FormErrors | undefined>(undefined);

type FormProps = Omit<ComponentPropsWithRef<"form">, "noValidate"> & {
  errors?: FormErrors;
};

function hasFieldErrors(errors: FormErrors | undefined): boolean {
  if (!errors) return false;
  return Object.values(errors).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
}

/**
 * A native `<form>`. It never sets `noValidate`, so the browser's own checks
 * stay on, with JavaScript off too. It shares `errors` with its fields through
 * context. When a new `errors` value arrives with at least one field error,
 * it moves focus to the first control marked `aria-invalid="true"` in page
 * order, so a screen reader reads that control's label and linked error.
 */
export function Form({ errors, className, ref, children, ...rest }: FormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const seen = useRef(errors);

  useEffect(() => {
    if (seen.current === errors) return;
    seen.current = errors;
    if (!hasFieldErrors(errors)) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  return (
    <FormErrorsContext value={errors}>
      <form ref={mergeRefs(formRef, ref)} className={cx(styles.root, className)} {...rest}>
        {children}
      </form>
    </FormErrorsContext>
  );
}
