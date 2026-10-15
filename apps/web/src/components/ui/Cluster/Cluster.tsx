import type { ComponentPropsWithRef, ElementType } from "react";

import { cx } from "@/lib/cx";

import styles from "./Cluster.module.css";

export type ClusterProps = ComponentPropsWithRef<"div"> & {
  /** Space between children, as a step of the `--space-*` scale. */
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** When set, `gap` becomes the row gap and this is the column gap. */
  columnGap?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Alignment on the cross axis. */
  align?: "start" | "center" | "end";
  /** Distribution on the main axis. */
  justify?: "start" | "center" | "between" | "end";
  /** The element to render. The default is a div. */
  as?: "div" | "section" | "ul" | "ol" | "nav" | "footer" | "header";
};

export function Cluster({
  gap = 3,
  columnGap,
  align = "center",
  justify = "start",
  as = "div",
  className,
  ...rest
}: ClusterProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      data-gap={gap}
      data-column-gap={columnGap}
      data-align={align}
      data-justify={justify}
      className={cx(styles.root, className)}
      {...rest}
    />
  );
}
