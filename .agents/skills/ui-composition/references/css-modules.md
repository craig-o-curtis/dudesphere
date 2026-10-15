# CSS Modules for shared parts

## Shape of a part's module

```css
/* apps/web/src/components/ui/Text/Text.module.css */
.root {
  /* 1. Component tokens, with their defaults */
  --text-fg: var(--color-text);
  --text-size: var(--text-base);

  /* 2. Rules that read only the tokens above, or base tokens */
  color: var(--text-fg);
  font-size: var(--text-size);
}

/* 3. Variants and states set tokens, keyed on data attributes */
.root[data-tone="muted"] { --text-fg: var(--color-text-muted); }
.root[data-tone="danger"] { --text-fg: var(--color-danger); }
.root[data-size="sm"] { --text-size: var(--text-sm); }

/* 4. Forced colours and other media last */
@media (forced-colors: active) { … }
```

## Rules

- **One root class per part, named `.root`.** Inner elements get their own classes (`.label`, `.icon`). Compound parts get one class for each part.
- **Variants and states are data attributes**, never extra classes such as `.primary` or `.isPending`. The component writes `data-variant={variant}`. The CSS matches `[data-variant="primary"]`. Tests can check the attribute, and `3d-animator` can hook motion onto it.
- **Variants set tokens, not properties.** See `tokens.md`.
- **No `:global`** outside `src/styles/globals.css`.
- **No inline `style`** for looks. Inline style is allowed only for a value computed at run time that CSS can't know, such as a measured height, and then only as a custom property: `style={{ "--progress": pct }}`.
- **Don't repeat the global reset.** `globals.css` already sets `* { margin: 0 }`, `box-sizing: border-box`, and `font: inherit; color: inherit` on form controls. Don't write them again.
- **Logical properties** (`margin-block`, `padding-inline`, `inline-size`, `min-block-size`), as the existing modules do.
- **Reduced motion:** put any transition or animation inside `@media (prefers-reduced-motion: no-preference)`. `motion.css` sets the global rules.
- **Forced colours:** a part with a border or background that carries meaning sets a system colour under `@media (forced-colors: active)`, for example `border-color: ButtonText`.

## Merging classes: `cx()`

The helper lives in `apps/web/src/lib/cx.ts`, with a spec. Don't add `clsx` or `classnames`.

```ts
// apps/web/src/lib/cx.ts
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
```

A part always puts its own class first: `className={cx(styles.root, className)}`.

## Shape of a part's component

```tsx
// apps/web/src/components/ui/Text/Text.tsx
import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import styles from "./Text.module.css";

type TextProps = ComponentPropsWithRef<"p"> & {
  tone?: "default" | "muted" | "danger" | "success";
  size?: "xs" | "sm" | "base" | "lg";
};

export function Text({ tone = "default", size = "base", className, ...rest }: TextProps) {
  return <p data-tone={tone} data-size={size} className={cx(styles.root, className)} {...rest} />;
}
```

`ComponentPropsWithRef` carries `ref` as a normal prop, so there is no `forwardRef`. `...rest` spreads onto the root element. `className` is taken out of `rest` first and merged, so it is never overwritten.
