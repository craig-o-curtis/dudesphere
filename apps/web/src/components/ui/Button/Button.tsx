import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  /** Shows work in progress. The button stays focusable (it is not `disabled`) and ignores clicks. */
  pending?: boolean;
};

export function Button({
  variant = "secondary",
  pending = false,
  type = "button",
  className,
  onClick,
  ...rest
}: ButtonProps) {
  // Blocking needs no event handler, so the part stays safe in a Server Component:
  // while pending, the click handler is dropped and a submit button turns into a
  // plain one, which cannot send the form a second time.
  return (
    <button
      {...rest}
      type={pending ? "button" : type}
      onClick={pending ? undefined : onClick}
      className={cx(styles.button, className)}
      data-variant={variant}
      data-pending={pending ? "" : undefined}
      aria-disabled={pending ? true : rest["aria-disabled"]}
    />
  );
}
