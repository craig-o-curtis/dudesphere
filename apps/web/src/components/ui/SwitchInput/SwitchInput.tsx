import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./SwitchInput.module.css";

type SwitchInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "role">;

/**
 * A native checkbox with `role="switch"`, drawn as a switch. It posts like a
 * checkbox with JavaScript off. Server-safe.
 */
export function SwitchInput({ className, ...rest }: SwitchInputProps) {
  // oxlint-disable-next-line jsx-a11y/role-has-required-aria-props -- a native checkbox reports its state as checked, so aria-checked is not needed
  return <input type="checkbox" role="switch" className={cx(styles.root, className)} {...rest} />;
}
