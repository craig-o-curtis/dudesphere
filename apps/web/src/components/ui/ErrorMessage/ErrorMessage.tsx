import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./ErrorMessage.module.css";

type ErrorMessageProps = Omit<ComponentPropsWithRef<"p">, "children"> & {
  /** One message or a list. A list is joined with a space. */
  messages?: string | string[];
};

/**
 * The error under a control. Renders text only, and nothing when there is no
 * message. It is not `role="alert"`: focus and `aria-describedby` announce it.
 * Server-safe.
 */
export function ErrorMessage({ messages, className, ...rest }: ErrorMessageProps) {
  const text = Array.isArray(messages) ? messages.join(" ") : messages;
  if (!text) return null;
  return (
    <p className={cx(styles.root, className)} {...rest}>
      {text}
    </p>
  );
}
