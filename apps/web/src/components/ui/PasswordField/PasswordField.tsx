"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { ErrorMessage } from "../ErrorMessage/ErrorMessage";
import { useField } from "../Field/useField";
import { Hint } from "../Hint/Hint";
import { Label } from "../Label/Label";
import { PasswordInput } from "../PasswordInput/PasswordInput";

import fieldStyles from "../Field/Field.module.css";

export type PasswordFieldProps = Omit<
  ComponentPropsWithRef<typeof PasswordInput>,
  "id" | "name"
> & {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Overrides the errors the surrounding `Form` holds for `name`. */
  errors?: string | string[];
  /** Forces the invalid state. Overrides what the errors say. */
  invalid?: boolean;
};

/**
 * Label, password input, optional hint and error, wired together. `className` goes
 * on the wrapper. `ref` and every other native prop go on the input.
 */
export function PasswordField({
  name,
  label,
  hint,
  errors,
  invalid,
  className,
  onChange,
  "aria-describedby": describedBy,
  ...rest
}: PasswordFieldProps) {
  const field = useField({ name, hint: Boolean(hint), errors, invalid, describedBy, onChange });
  return (
    <div className={cx(fieldStyles.root, className)}>
      <Label htmlFor={field.inputProps.id}>{label}</Label>
      <PasswordInput {...rest} {...field.inputProps} />
      {hint ? <Hint id={field.hintId}>{hint}</Hint> : null}
      <ErrorMessage id={field.errorId} messages={field.messages} />
    </div>
  );
}
