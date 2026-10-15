import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./Label.module.css";

type LabelProps = ComponentPropsWithRef<"label">;

/** A `<label>`. Point it at its control with `htmlFor`. Server-safe. */
export function Label({ className, ...rest }: LabelProps) {
  // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the caller passes htmlFor or wraps the control
  return <label className={cx(styles.root, className)} {...rest} />;
}
