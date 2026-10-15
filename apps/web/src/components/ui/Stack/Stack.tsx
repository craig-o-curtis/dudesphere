import type { ComponentPropsWithRef, ElementType } from "react";

import { cx } from "@/lib/cx";

import styles from "./Stack.module.css";

export type StackProps = ComponentPropsWithRef<"div"> & {
  /** Space between children, as a step of the `--space-*` scale. */
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** The element to render. The default is a div. */
  as?: "div" | "section" | "ul" | "ol" | "nav";
};

export function Stack({ gap = 4, as = "div", className, ...rest }: StackProps) {
  const Tag = as as ElementType;
  return <Tag data-gap={gap} className={cx(styles.root, className)} {...rest} />;
}
