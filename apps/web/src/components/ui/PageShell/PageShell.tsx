import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./PageShell.module.css";

export type PageShellRootProps = ComponentPropsWithRef<"section"> & {
  /**
   * The column. `form` is a narrow form, `content` is for reading, and `fit`
   * is no cap: the column is as wide as its widest item.
   */
  width?: "form" | "content" | "fit";
  /** Where the content sits in the page's height: at the `start` or in the middle. */
  align?: "start" | "center";
  /** The space between the items: `m` is `--space-4`, `l` is `--space-6`. */
  gap?: "m" | "l";
  /** `center` centres the text of every item. The items themselves stay where they are. */
  text?: "start" | "center";
};

/**
 * The page column. It is a `<section>`: the root layout already renders the
 * one `<main>`, so a page must never add another.
 */
function Root({
  width = "content",
  align = "start",
  gap = "m",
  text = "start",
  className,
  ...rest
}: PageShellRootProps) {
  return (
    <section
      data-width={width}
      data-align={align}
      data-gap={gap}
      data-text={text}
      className={cx(styles.root, className)}
      {...rest}
    />
  );
}

/** Holds the page's heading and an optional lead line, centred. */
function Header({ className, ...rest }: ComponentPropsWithRef<"header">) {
  return <header className={cx(styles.header, className)} {...rest} />;
}

export const PageShell = { Root, Header };
