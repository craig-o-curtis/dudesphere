"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { CheckboxInput } from "../CheckboxInput/CheckboxInput";
import { ErrorMessage } from "../ErrorMessage/ErrorMessage";
import { useField } from "../Field/useField";
import { Hint } from "../Hint/Hint";
import { Label } from "../Label/Label";

import fieldStyles from "../Field/Field.module.css";

export type CheckboxFieldProps = Omit<
  ComponentPropsWithRef<typeof CheckboxInput>,
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
 * A checkbox and its label on one row, then the optional hint and error.
 * `className` goes on the wrapper. `ref` and every other native prop go on the input.
 */
export function CheckboxField({
  name,
  label,
  hint,
  errors,
  invalid,
  className,
  onChange,
  "aria-describedby": describedBy,
  ...rest
}: CheckboxFieldProps) {
  const field = useField({ name, hint: Boolean(hint), errors, invalid, describedBy, onChange });
  return (
    <div className={cx(fieldStyles.root, className)}>
      <div className={fieldStyles.row}>
        <CheckboxInput {...rest} {...field.inputProps} />
        <Label htmlFor={field.inputProps.id}>{label}</Label>
      </div>
      {hint ? <Hint id={field.hintId}>{hint}</Hint> : null}
      <ErrorMessage id={field.errorId} messages={field.messages} />
    </div>
  );
}
