import type { ComponentPropsWithRef, ElementType, Ref } from "react";

import { cx } from "@/lib/cx";

import styles from "./Text.module.css";

type TextProps = Omit<ComponentPropsWithRef<"p">, "ref"> & {
  as?: "p" | "span" | "div";
  tone?: "default" | "muted" | "danger" | "success";
  size?: "xs" | "sm" | "base" | "lg" | "xl";
  ref?: Ref<HTMLElement>;
};

const TAGS: Record<"p" | "span" | "div", ElementType<any>> = { p: "p", span: "span", div: "div" };

/** Body text. The tag, tone and size are separate choices. */
export function Text({ as = "p", tone = "default", size = "base", className, ...rest }: TextProps) {
  // `as` is one of three tags that share these props, so the tag is typed loosely.
  const Tag = TAGS[as];
  return <Tag data-tone={tone} data-size={size} className={cx(styles.root, className)} {...rest} />;
}
