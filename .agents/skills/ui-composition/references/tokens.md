# Tokens

All design values live in CSS custom properties. Base and role tokens are in `apps/web/src/styles/tokens.css`, which WEB-6 added. `tokens.spec.ts` checks that the two dark blocks match and that the colours pass contrast. Component tokens live at the top of each shared part's module.

## The three tiers

| Tier      | Where                                    | Examples                                                                                                                                   | Who reads it                                               |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Base      | `tokens.css` `:root`                     | `--space-1` … `--space-8`, `--radius-s`, `--radius-m`, `--text-xs` … `--text-3xl`, `--dur-base`, `--ease-out`                              | Role tokens and component tokens                           |
| Role      | `tokens.css`, with light and dark values | `--color-bg`, `--color-surface-raised`, `--color-text-muted`, `--color-accent`, `--color-danger`, `--color-focus`, `--color-border-strong` | Component tokens                                           |
| Component | Top of `ui/<Name>/<Name>.module.css`     | `--button-bg`, `--input-border-invalid`, `--card-padding`                                                                                  | That part's own rules, and consumers who want to adjust it |

Colour lives at the role tier, so light and dark switch in one place. A component never needs its own dark-mode block.

## Naming

`--<part>-<property>[-<state>]`, in kebab case. For example: `--button-bg`, `--button-bg-hover`, `--input-border-invalid`, `--dialog-max-width`.

Use the part's name, not the element's name. `--button-*` is right even for `ButtonLink`, because it shares the module.

## How a part sets and reads its tokens

```css
/* apps/web/src/components/ui/Button/Button.module.css */
.root {
  --button-bg: var(--color-surface-raised);
  --button-fg: var(--color-text);
  --button-border: var(--color-border-strong);

  min-block-size: var(--control-min-height);
  padding: var(--space-2) var(--space-4);
  border: var(--border-width) solid var(--button-border);
  border-radius: var(--radius-m);
  background: var(--button-bg);
  color: var(--button-fg);
  font-weight: var(--font-weight-bold);
}

.root[data-variant="primary"] {
  --button-bg: var(--color-accent);
  --button-fg: var(--color-on-accent);
  --button-border: var(--color-on-accent);
}
```

Variants change tokens, not properties. Hover, pending and forced-colours rules then work the same for every variant.

## How a consumer adjusts a part

Pass a class that sets the part's tokens. Nothing else.

```css
/* apps/web/src/components/SessionCorner/SessionCorner.module.css */
.dangerAction {
  --button-border: var(--color-danger);
}
```

```tsx
<Button className={styles.dangerAction}>Sign out everywhere</Button>
```

If the same adjustment shows up in two features, it is a variant. Add it to the part.

## Tokens to add (WEB-54)

The audit found these values hard-coded across modules because no token covers them. Add them to `:root` in `tokens.css`, then replace every raw use.

| Token                  | Value         | Replaces                                     |
| ---------------------- | ------------- | -------------------------------------------- |
| `--control-min-height` | `44px`        | 7 uses in the form and SessionCorner modules |
| `--target-min`         | `24px`        | 10 uses (WCAG 2.2 target size)               |
| `--border-width`       | `1px`         | 10 `1px solid` borders                       |
| `--font-weight-bold`   | `700`         | 7 uses                                       |
| `--tracking-tight`     | `-0.02em`     | 3 page titles                                |
| `--leading-tight`      | `1.1`         | `globals.css` headings, page titles (`1`)    |
| `--leading-body`       | `1.5`         | `globals.css` body                           |
| `--measure-form`       | `28rem`       | The two form wrappers                        |
| `--measure-content`    | `60ch`        | SiteFooter, and later content pages          |
| `--opacity-pending`    | `0.8`         | The pending button state                     |
| `--z-skip`             | `100`         | SkipLink                                     |
| `--z-dialog`           | to be decided | The first Dialog                             |

Two hard-coded copies of tokens can't be replaced by `var()`, because they live outside CSS:

- `app/layout.tsx:47-48` copies `--color-bg` as hex for the `themeColor` viewport metadata. Keep it, but add it to `tokens.spec.ts` so a change to the token fails the test.
- `lib/motion.ts` copies the duration tokens for `motion/react`. `motion.spec.ts` already checks they match. Keep doing that for any new motion token.

## Rules

- No raw `px`, `rem`, `em`, `ch`, hex, `rgb()`, font weight, line height, z-index or duration in a module. Allowed: `0`, `100%`, `1fr`, `auto`, `1lh`, `currentColor`, and system colours inside `@media (forced-colors: active)`.
- A part's rules read its component tokens. Component tokens read role or base tokens. Features read nothing; they only set component tokens through a class.
- A new token needs a reason that holds across more than one part. A value used by one part only belongs in that part's component tokens.
- Keep unused base tokens only if a planned story needs them. The audit lists 8 unused tokens. WEB-54 decides which to keep.
