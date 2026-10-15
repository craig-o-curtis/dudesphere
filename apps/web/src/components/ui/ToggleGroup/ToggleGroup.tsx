import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./ToggleGroup.module.css";
import hidden from "@/components/ui/VisuallyHidden/VisuallyHidden.module.css";

type RootProps = Omit<ComponentPropsWithRef<"fieldset">, "children"> & {
  /** Names the group for screen readers. Sighted users do not see it. */
  legend: ReactNode;
  children: ReactNode;
};

/**
 * A pill-shaped frame around a few toggle buttons. It is a `<fieldset>`, so
 * the legend names the group. It holds no state: the feature decides which
 * item is pressed. Each item is its own Tab stop, with no arrow-key moves.
 */
function Root({ legend, children, className, ...rest }: RootProps) {
  return (
    <fieldset className={cx(styles.root, className)} {...rest}>
      <legend className={hidden.root}>{legend}</legend>
      {children}
    </fieldset>
  );
}

type ItemProps = ComponentPropsWithRef<"button">;

/**
 * One toggle button. Pass `aria-pressed` to say whether it is on. The check
 * mark is the cue that is not colour, and it always takes its space, so
 * nothing shifts when the item is pressed.
 */
function Item({ className, type = "button", ...rest }: ItemProps) {
  const pressed = rest["aria-pressed"] === true || rest["aria-pressed"] === "true";
  return (
    <button
      type={type}
      data-pressed={pressed ? "true" : undefined}
      className={cx(styles.item, className)}
      {...rest}
    />
  );
}

export const ToggleGroup = { Root, Item };
