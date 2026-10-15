import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./Notice.module.css";

export type NoticeProps = ComponentPropsWithRef<"output"> & {
  tone?: "default" | "muted" | "danger" | "success";
  /** Leave it out to inherit the surrounding text size. */
  size?: "xs" | "sm" | "base" | "lg" | "xl";
};

/**
 * A polite live region (`<output>` has the `status` role). Render it even when
 * empty, so a screen reader hears the text when it arrives. One line stays
 * reserved, so the layout does not jump.
 */
export function Notice({ tone = "default", size, className, ...rest }: NoticeProps) {
  return (
    <output data-tone={tone} data-size={size} className={cx(styles.root, className)} {...rest} />
  );
}
