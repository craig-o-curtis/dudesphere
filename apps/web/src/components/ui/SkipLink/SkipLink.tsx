import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./SkipLink.module.css";

type SkipLinkProps = ComponentPropsWithRef<"a"> & { href: string };

/** The first focusable element on a page. It stays off-screen until it has focus. */
export function SkipLink({ className, children, ...rest }: SkipLinkProps) {
  return (
    <a className={cx(styles.root, className)} {...rest}>
      {children}
    </a>
  );
}
