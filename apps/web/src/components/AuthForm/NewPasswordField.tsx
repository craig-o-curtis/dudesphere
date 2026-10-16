import type { ComponentProps } from "react";

import { PasswordField } from "@/components/ui/PasswordField/PasswordField";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from "@/lib/auth-rules";

export const NEW_PASSWORD_TITLE = "12 to 128 characters.";

type NewPasswordFieldProps = Omit<
  ComponentProps<typeof PasswordField>,
  "autoComplete" | "required" | "minLength" | "maxLength" | "pattern" | "title"
>;

/**
 * A password the member is choosing: the sign-up password, and both fields on
 * the reset form. The rules and the title are written once here. Pass `hint`
 * on the field that should show the rule.
 */
export function NewPasswordField(props: NewPasswordFieldProps) {
  return (
    <PasswordField
      autoComplete="new-password"
      required
      minLength={PASSWORD_MIN_LENGTH}
      maxLength={PASSWORD_MAX_LENGTH}
      pattern={PASSWORD_PATTERN}
      title={NEW_PASSWORD_TITLE}
      {...props}
    />
  );
}
