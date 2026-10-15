import Link from "next/link";
import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./InlineLink.module.css";

type InlineLinkProps = ComponentPropsWithRef<typeof Link> & {
  /** `inherit` takes the colour of the text around it. `accent` uses the accent colour. */
  tone?: "inherit" | "accent";
};

/** An underlined link. By default it takes its colour from the text around it. */
export function InlineLink({ tone = "inherit", className, ...rest }: InlineLinkProps) {
  return <Link data-tone={tone} className={cx(styles.root, className)} {...rest} />;
}
