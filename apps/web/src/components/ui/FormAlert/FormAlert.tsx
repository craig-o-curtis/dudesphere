import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./FormAlert.module.css";

type FormAlertProps = ComponentPropsWithRef<"p">;

/**
 * A box for an error that belongs to the whole form. It is a `role="alert"`
 * region, and it renders nothing when it has no message, so a feature can
 * always render it. Server-safe.
 */
export function FormAlert({ children, className, ...rest }: FormAlertProps) {
  if (children === null || children === undefined || children === false || children === "") {
    return null;
  }
  return (
    <p role="alert" className={cx(styles.root, className)} {...rest}>
      {children}
    </p>
  );
}
