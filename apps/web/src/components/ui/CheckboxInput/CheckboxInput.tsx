import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./CheckboxInput.module.css";

type CheckboxInputProps = Omit<ComponentPropsWithRef<"input">, "type">;

/** A native checkbox at the 24 px target size. Server-safe. */
export function CheckboxInput({ className, ...rest }: CheckboxInputProps) {
  return <input type="checkbox" className={cx(styles.root, className)} {...rest} />;
}
