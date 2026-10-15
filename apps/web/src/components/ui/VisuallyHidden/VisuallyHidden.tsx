import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./VisuallyHidden.module.css";

type VisuallyHiddenProps = ComponentPropsWithRef<"span">;

/** Text for screen readers only. Sighted users do not see it. */
export function VisuallyHidden({ className, ...rest }: VisuallyHiddenProps) {
  return <span className={cx(styles.root, className)} {...rest} />;
}
