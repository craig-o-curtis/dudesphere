import type { ComponentPropsWithRef, Ref } from "react";

import { cx } from "@/lib/cx";

import styles from "./Heading.module.css";

type HeadingProps = Omit<ComponentPropsWithRef<"h1">, "ref"> & {
  /** Picks the element (h1 to h4). It has no effect on the look. */
  level: 1 | 2 | 3 | 4;
  /** Picks the look. It has no effect on the element. */
  size?: "xl" | "2xl" | "3xl";
  ref?: Ref<HTMLHeadingElement>;
};

export function Heading({ level, size = "xl", className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag data-size={size} className={cx(styles.root, className)} {...rest} />;
}
