import Link from "next/link";
import type { ComponentProps } from "react";

import type { ButtonVariant } from "@/components/ui/Button/Button";
import { cx } from "@/lib/cx";

import styles from "@/components/ui/Button/Button.module.css";

export type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

export function ButtonLink({ variant = "secondary", className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={cx(styles.button, className)} data-variant={variant} />;
}
