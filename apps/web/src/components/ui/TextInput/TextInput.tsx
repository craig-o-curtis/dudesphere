import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./TextInput.module.css";

type TextInputProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  type?: "text" | "email" | "password" | "tel" | "url" | "search";
};

/**
 * The text box look. It shows the invalid look from `aria-invalid="true"`.
 * Server-safe. Rules such as `pattern` come from the caller.
 */
export function TextInput({ type = "text", className, ...rest }: TextInputProps) {
  return <input type={type} className={cx(styles.root, className)} {...rest} />;
}
