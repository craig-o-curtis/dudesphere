"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { EmailInput } from "../EmailInput/EmailInput";
import { ErrorMessage } from "../ErrorMessage/ErrorMessage";
import { useField } from "../Field/useField";
import { Hint } from "../Hint/Hint";
import { Label } from "../Label/Label";

import fieldStyles from "../Field/Field.module.css";

export type EmailFieldProps = Omit<ComponentPropsWithRef<typeof EmailInput>, "id" | "name"> & {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Overrides the errors the surrounding `Form` holds for `name`. */
  errors?: string | string[];
  /** Forces the invalid state. Overrides what the errors say. */
  invalid?: boolean;
};

/**
 * Label, email input, optional hint and error, wired together. `className` goes
 * on the wrapper. `ref` and every other native prop go on the input.
 */
export function EmailField({
  name,
  label,
  hint,
  errors,
  invalid,
  className,
  onChange,
  "aria-describedby": describedBy,
  ...rest
}: EmailFieldProps) {
  const field = useField({ name, hint: Boolean(hint), errors, invalid, describedBy, onChange });
  return (
    <div className={cx(fieldStyles.root, className)}>
      <Label htmlFor={field.inputProps.id}>{label}</Label>
      <EmailInput {...rest} {...field.inputProps} />
      {hint ? <Hint id={field.hintId}>{hint}</Hint> : null}
      <ErrorMessage id={field.errorId} messages={field.messages} />
    </div>
  );
}
