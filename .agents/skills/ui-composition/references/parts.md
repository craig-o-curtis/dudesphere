# Shared parts catalogue

Every shared part lives in `apps/web/src/components/ui/<Name>/`, as `<Name>.tsx`, `<Name>.module.css` and `<Name>.spec.tsx`. Import it as `@/components/ui/<Name>/<Name>`. Exports are named, not default, like the rest of `components/`.

**Status:** each part is **planned** until a story builds it. WEB-54 builds the first set. Change a part's status to **built**, with the story ID, in the same change that adds it.

Every part also takes `className`, the native props of its root element, and `ref`. Those are left out of the tables below.

## Contents

1. Button and ButtonLink
2. Text and Heading
3. Field
4. FormAlert
5. Notice
6. Stack and Cluster
7. PageShell
8. Card
9. VisuallyHidden
10. Dialog and AlertDialog
11. Later parts

## 1. Button and ButtonLink

Status: planned (WEB-54). Native `<button>` and `<a>` (Next `<Link>`). Server-safe, except that `pending` needs the caller to be a client component, because it comes from `useFormStatus` or `useActionState`.

| Prop      | Type                                  | Notes                                                                                                                                                   |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant` | `"primary" \| "secondary" \| "quiet"` | Default `"secondary"`. Rendered as `data-variant`                                                                                                       |
| `pending` | `boolean`                             | Button only. Sets `aria-disabled="true"`, `data-pending`, and blocks clicks while keeping focus. Replaces the guard copied in SignInForm and SignUpForm |

Component tokens: `--button-bg`, `--button-fg`, `--button-border`, `--button-bg-hover`, `--button-radius`, `--button-min-height`, `--button-padding-inline`.

Owns: the 44 px control height (`--control-min-height`), the 24 px target (`--target-min`), focus ring, forced-colours border (`ButtonText`), the pending cursor and opacity.

`ButtonLink` shares `Button.module.css` and renders Next's `<Link>`. Use it for "Sign in" and "Sign up" in SessionCorner. Use a real `<button>` for actions and a link for navigation, never the other way round.

## 2. Text and Heading

Status: planned (WEB-54). Native. Server-safe.

`Text`:

| Prop   | Type                                            | Notes                                       |
| ------ | ----------------------------------------------- | ------------------------------------------- |
| `as`   | `"p" \| "span" \| "div"`                        | Default `"p"`                               |
| `size` | `"xs" \| "sm" \| "base" \| "lg"`                | Maps to `--text-*`. Rendered as `data-size` |
| `tone` | `"default" \| "muted" \| "danger" \| "success"` | Rendered as `data-tone`                     |

Replaces the muted helper text in CookieNote, SessionCorner, SignUpForm, ThemeToggle and the home page.

`Heading`:

| Prop    | Type                     | Notes                                                                         |
| ------- | ------------------------ | ----------------------------------------------------------------------------- |
| `level` | `1 \| 2 \| 3 \| 4`       | Picks the element (`h1` to `h4`). Required, so the outline is always a choice |
| `size`  | `"xl" \| "2xl" \| "3xl"` | Look, kept apart from level. Default follows level                            |

Owns: `--font-display`, tight tracking and leading for big sizes. Replaces the page title rule written three times.

`InlineLink` (planned): an underlined text link with the 24 px target. Replaces `.alt a` and `.formError a`.

## 3. Field

Status: planned (WEB-54). Base UI `Field` and `Form`. Needs `"use client"`.

A compound part:

```tsx
<Field.Root name="email">
  <Field.Label>Email</Field.Label>
  <Field.Control type="email" autoComplete="email" required />
  <Field.Hint>We send sign-in links here.</Field.Hint>
  <Field.Error />
</Field.Root>
```

- `Field.Root` wraps Base UI `Field.Root`. It takes `name`. It also takes `invalid` and `errors` directly, so a form library could drive it later (see `context/audits/forms-analysis.md`).
- `Field.Control` wraps Base UI `Field.Control`. Base UI wires `id`, `aria-invalid` and `aria-describedby`, so features stop building ids by hand.
- `Field.Hint` wraps Base UI `Field.Description`. We call it Hint because that is the word the app already uses.
- `Field.Error` wraps Base UI `Field.Error`. With a Base UI `Form` around it, the server's field errors arrive through the Form's `errors` prop (see `base-ui.md`).

Component tokens: `--field-gap`, `--input-bg`, `--input-border`, `--input-border-invalid`, `--input-radius`, `--input-min-height`.

Replaces six hand-built fields in SignInForm and SignUpForm, along with their `describedBy()`, `invalid()` and `errorFor()` helpers.

## 4. FormAlert

Status: planned (WEB-54). Native. Server-safe.

A `role="alert"` box for a form-level error, with a danger border. It takes `children` (the message, which may hold an `InlineLink`). It renders nothing when it has no children, so features don't need to wrap it in a condition.

Component tokens: `--alert-border`, `--alert-fg`, `--alert-padding`, `--alert-radius`.

## 5. Notice

Status: planned (WEB-54). Native `<output>`. Server-safe.

A polite live region (`<output>` maps to the `status` role). It reserves one line (`min-block-size: 1lh`) so the layout doesn't jump when text arrives. It takes `tone` like `Text`. Replaces the `<output>` lines in SessionCorner and ThemeToggle.

## 6. Stack and Cluster

Status: planned (WEB-54). Native `<div>`, or the element named by `as`. Server-safe.

| Part      | What it is               | Props                                                                                                    |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `Stack`   | Vertical grid with a gap | `gap: 1 to 8` (maps to `--space-*`), `as`                                                                |
| `Cluster` | Wrapping flex row        | `gap`, `align: "start" \| "center" \| "end"`, `justify: "start" \| "center" \| "between" \| "end"`, `as` |

Props render as data attributes (`data-gap="4"`). They never render as inline styles. Replaces the `display: grid; gap` and `display: flex; flex-wrap: wrap` blocks in the forms, SessionCorner and SiteFooter.

## 7. PageShell

Status: planned (WEB-54). Native `<section>`. Server-safe. The root layout already renders `<main>`, so PageShell never does.

Compound part: `PageShell.Root` (the centred page column), `PageShell.Header` (holds a `Heading` and an optional lead `Text`). Takes `width: "form" | "content"` (maps to `--measure-form` and `--measure-content`) and `align: "start" | "center"`.

Replaces the page grid in `app/page.module.css`, `(public)/login/page.module.css` and `(public)/signup/page.module.css`.

## 8. Card

Status: planned. The first story that shows a framed item builds it, most likely FEED-13's abiding. Native `<article>` or `<section>`. Server-safe.

Compound part: `Card.Root`, `Card.Header`, `Card.Body`, `Card.Footer`. Takes `variant: "flat" | "raised"` and `as`.

Component tokens: `--card-bg`, `--card-border`, `--card-radius`, `--card-padding`, `--card-shadow`.

## 9. VisuallyHidden

Status: planned (WEB-54). Native `<span>`. Server-safe.

Hides content visually and keeps it for screen readers. Moves the rule that lives only in `ThemeToggle.module.css` (`.legend`) into one place.

## 10. Dialog and AlertDialog

Status: planned. The first story with a modal builds it, most likely FEED-16's thread modal (an intercepting route). Base UI `Dialog` and `AlertDialog`. Needs `"use client"`.

Compound part, following Base UI's anatomy: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Popup` (includes the portal and backdrop), `Dialog.Title`, `Dialog.Description`, `Dialog.Close`.

Owns: focus moving in and returning, Escape, the inert background, scroll lock, and the open and close styles through `[data-starting-style]` and `[data-ending-style]`.

Component tokens: `--dialog-bg`, `--dialog-radius`, `--dialog-padding`, `--dialog-max-width`, `--backdrop-bg`, `--z-dialog`.

Use `AlertDialog` for anything destructive that needs a clear yes or no. Check how the exit animation behaves inside a `<ViewTransition>` before you rely on it (see `base-ui.md`).

## 11. Later parts

Build these when a story needs them, using the same rules: Popover and Menu (Base UI), Toast (Base UI, for "abiding posted"), Tooltip (Base UI), Select and Combobox (Base UI, for hashtag pickers), Tabs, Avatar and Skeleton (native).
