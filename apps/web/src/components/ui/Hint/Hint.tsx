import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./Hint.module.css";

type HintProps = ComponentPropsWithRef<"p">;

/** Help text under a control, in the muted small look. Server-safe. */
export function Hint({ className, ...rest }: HintProps) {
  return <p className={cx(styles.root, className)} {...rest} />;
}
