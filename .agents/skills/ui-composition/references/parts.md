# Shared parts catalogue

Every shared part lives in `apps/web/src/components/ui/<Name>/`, as `<Name>.tsx`, `<Name>.module.css` and `<Name>.spec.tsx`. Import it as `@/components/ui/<Name>/<Name>`. Exports are named, not default, like the rest of `components/`.

**Status:** each part is **planned** until a story builds it. WEB-54 built the first set. Change a part's status to **built**, with the story ID, in the same change that adds it.

Every part also takes `className`, the native props of its root element, and `ref`. Those are left out of the tables below. Where a table says "Props", it lists only what the part adds. The few parts that put `className` or `ref` somewhere other than the root say so.

## Contents

1. Button and ButtonLink
2. Text, Heading and InlineLink
3. Form, the building blocks and the composed fields
4. FormAlert
5. Notice
6. Stack and Cluster
7. PageShell
8. VisuallyHidden and SkipLink
9. ToggleGroup
10. Card
11. Dialog and AlertDialog
12. Later parts

## 1. Button and ButtonLink

Status: built (WEB-54). Native `<button>` and `<a>` (Next `<Link>`). Server-safe. `pending` needs no handler, so a Server Component can render a `Button`. The value itself comes from `useFormStatus` or `useActionState`, so the caller is a client component.

| Prop      | Type                                  | Notes                                                                                                                                                                                                                                                |
| --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant` | `"primary" \| "secondary" \| "quiet"` | Default `"secondary"`. Rendered as `data-variant`. Primary is the form submit look, secondary is the sign-out look, quiet has no border or fill and is bold                                                                                          |
| `pending` | `boolean`                             | `Button` only. Sets `aria-disabled="true"` and `data-pending`, drops `onClick`, and turns the button into `type="button"` so it can't send the form twice. It stays focusable. Without `pending`, `Button` defaults to `type="button"`, not `submit` |

Component tokens: `--button-bg`, `--button-fg`, `--button-border`, `--button-padding-inline`, `--button-decoration`. Variants set these and nothing else.

Owns: the 44 px control height (`--control-min-height`), the 24 px target (`--target-min`), the focus ring, the forced-colours border (`ButtonText`), and the pending cursor and opacity (`--opacity-pending`).

`ButtonLink` takes every prop of Next's `<Link>` plus `variant`. It shares `Button.module.css`. The `quiet` variant underlines on a link. SessionCorner uses it for "Sign in" and "Sign up". Use a real `<button>` for actions and a link for navigation, never the other way round.

## 2. Text, Heading and InlineLink

Status: built (WEB-54). Native. Server-safe.

`Text`:

| Prop   | Type                                            | Notes                                                                                               |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `as`   | `"p" \| "span" \| "div"`                        | Default `"p"`                                                                                       |
| `size` | `"xs" \| "sm" \| "base" \| "lg" \| "xl"`        | Default `"base"`. Maps to `--text-*`. Rendered as `data-size`. `xl` came in with the home page lede |
| `tone` | `"default" \| "muted" \| "danger" \| "success"` | Default `"default"`. Rendered as `data-tone`                                                        |

Component tokens: `--text-fg`, `--text-size`.

`Heading`:

| Prop    | Type                     | Notes                                                                                    |
| ------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `level` | `1 \| 2 \| 3 \| 4`       | Required. Picks the element (`h1` to `h4`) and has no effect on the look                 |
| `size`  | `"xl" \| "2xl" \| "3xl"` | Default `"xl"`, not tied to level. Rendered as `data-size`. Has no effect on the element |

Component token: `--heading-size`. Owns `--font-display`, `--tracking-tight` and `--leading-tight`.

`InlineLink`: an underlined Next `<Link>` that takes its colour from the text around it (`--link-fg`, which defaults to `inherit`) and keeps the 24 px target. Its one added prop is `tone`: `"inherit"` (default) or `"accent"`, rendered as `data-tone`. `accent` sets `--link-fg` to `--color-accent`. A parent class that sets `--link-fg` colours every link inside it. Used for the alt line and the `accountReady` link in the auth forms.

## 3. Form, the building blocks and the composed fields

Status: built (WEB-54). **Native, no Base UI, no form library.** `context/audits/forms-analysis.md` ("Re-checked for WEB-54") says why. Two findings drove it:

- Base UI's `Form` always renders `noValidate`, which turns off the browser's own checks with JavaScript off.
- Base UI's `Field` adds the hint and error ids to `aria-describedby` in a layout effect, so the server HTML has no links.

Our parts never set `noValidate`, and they make their ids with `useId` during render, so the server HTML already holds the label's `for`, `aria-invalid` and `aria-describedby`.

The design has three layers. A feature uses the top two.

### Form

`"use client"`. A native `<form>`.

| Prop     | Type                                          | Notes                                                                                                       |
| -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `errors` | `Partial<Record<string, string \| string[]>>` | Field errors by field `name`. Matches `AuthFieldErrors`. Shared with the fields through `FormErrorsContext` |

`noValidate` is not accepted. When a new `errors` value arrives with at least one field error, `Form` moves focus to the first control with `aria-invalid="true"`, in page order. It does nothing on the first render. It also exports `FormErrorsContext` and the type `FormErrors`.

### Building blocks

Each takes `className` (through `cx`), the native props of its element, and `ref`. None knows about auth, and rules such as `pattern` come from the caller. All are server-safe except `PasswordInput`.

| Part            | Element                                 | Adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Label`         | `<label>`                               | Token `--label-size`, `--label-weight`. Pass `htmlFor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Hint`          | `<p>`                                   | Muted small help text. Tokens `--hint-fg`, `--hint-size`. Pass `id`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ErrorMessage`  | `<p>`                                   | Prop `messages?: string \| string[]`. A list is joined with a space. Renders text only, and nothing when empty. Not `role="alert"`: focus and `aria-describedby` announce it. Tokens `--error-fg`, `--error-size`                                                                                                                                                                                                                                                                                                            |
| `TextInput`     | `<input>`                               | Prop `type?: "text" \| "email" \| "password" \| "tel" \| "url" \| "search"`, default `"text"`. Owns the input look. Shows the invalid look from `aria-invalid="true"`, with a thicker forced-colours border. Tokens `--input-bg`, `--input-border`, `--input-border-invalid`, `--input-radius`, `--input-min-height`                                                                                                                                                                                                         |
| `EmailInput`    | `<input type="email">`                  | A `TextInput` with `type` fixed. `type` is not accepted                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PasswordInput` | `<div>` around `<input>`                | `"use client"`. `type` is not accepted. Adds a show-or-hide eye button, `type="button"`, named "Show password", with `aria-pressed` and `aria-controls`. The button is `inert` and invisible until hydration, and takes its space, so nothing shifts. `className` goes on the input. Sets `spellcheck="false"`, `autocorrect="off"` and `autocapitalize="off"` in both states, and hides the password again when its form submits (the value is still posted). Tokens `--password-toggle-size`, `--input-padding-inline-end` |
| `CheckboxInput` | `<input type="checkbox">`               | `type` is not accepted. 24 px target. Tokens `--checkbox-size`, `--checkbox-accent`, `--checkbox-outline-invalid`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SwitchInput`   | `<input type="checkbox" role="switch">` | `type` and `role` are not accepted. Posts like a checkbox with JavaScript off. Its motion stops under `prefers-reduced-motion: reduce`. Works in forced colours. Tokens `--switch-track`, `--switch-track-on`, `--switch-thumb`, `--switch-width`, `--switch-height`, `--switch-thumb-size`, `--switch-gap`                                                                                                                                                                                                                  |

### Composed fields

`"use client"`. `TextField`, `EmailField`, `PasswordField`, `CheckboxField` and `SwitchField`. Each wires a label, an input, an optional hint and an error together.

```tsx
<Form action={formAction} errors={state.fieldErrors}>
  <EmailField
    name="email"
    label="Email"
    hint="We send sign-in links here."
    required
    autoComplete="email"
  />
  <PasswordField
    name="password"
    label="Password"
    required
    minLength={8}
    autoComplete="new-password"
  />
</Form>
```

| Prop      | Type                 | Notes                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`    | `string`             | Required. Also the key into the form's `errors`                                                                                                                                                                                                                                                                 |
| `label`   | `ReactNode`          | Required                                                                                                                                                                                                                                                                                                        |
| `hint`    | `ReactNode`          | Optional. The hint element is rendered, and linked, only when this is set                                                                                                                                                                                                                                       |
| `errors`  | `string \| string[]` | Optional. Overrides what the surrounding `Form` holds for `name`. Keep its identity between renders (a literal array in JSX makes a new one each render). To show the same message again after an edit, pass a new array, or `undefined` between the errors. A plain string sent again with no gap stays hidden |
| `invalid` | `boolean`            | Optional. Forces the invalid state on or off. Overrides what the errors say. Together with `errors`, this lets a form library drive the field later                                                                                                                                                             |

Every other prop is a native prop of the input and goes to the input, `ref` included. `className` goes on the wrapper `<div>`. `id` is not accepted: the field makes it. An `aria-describedby` you pass is kept and put first.

The order is: label, input, hint, error. In `CheckboxField` and `SwitchField` the input and its label share one row, then the hint and error. The wrapper uses `--field-gap`.

The wiring lives in `Field/useField.ts` (`"use client"`, with a spec), which all five fields share:

- Ids come from `useId` during render, so they are in the server HTML.
- `aria-describedby` names only elements that are rendered. There is no dangling id.
- **Clear on edit (A11Y-3).** Typing in the field drops its server error and `aria-invalid` until the next set of errors arrives. It uses no effect: the cleared errors value is kept in state, and errors show only while it differs from the current one. Your own `onChange` still runs.

Replaces six hand-built fields in SignInForm and SignUpForm, along with their `describedBy()`, `invalid()` and `errorFor()` helpers.

Component tokens set by `Field/Field.module.css`: `--field-gap`. That file holds no part of its own: it is the layout the five fields share.

## 4. FormAlert

Status: built (WEB-54). Native `<p role="alert">`. Server-safe.

It takes `children` (the message, which may hold an `InlineLink`). It renders nothing when `children` is `null`, `undefined`, `false` or `""`, so features don't need to wrap it in a condition. It renders text and elements the caller passes, never HTML strings.

Component tokens: `--alert-border`, `--alert-fg`, `--alert-padding`, `--alert-radius`.

## 5. Notice

Status: built (WEB-54). Native `<output>`. Server-safe.

| Prop   | Type                                            | Notes                                                                            |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `tone` | `"default" \| "muted" \| "danger" \| "success"` | Default `"default"`. Rendered as `data-tone`                                     |
| `size` | `"xs" \| "sm" \| "base" \| "lg" \| "xl"`        | Optional. Rendered as `data-size`. Left out, it inherits the text size around it |

A polite live region (`<output>` maps to the `status` role). Render it even when empty, so a screen reader hears the text when it arrives. It reserves one line (`min-block-size: 1lh`) so the layout doesn't jump. Component token: `--notice-fg`. Used in SessionCorner and ThemeToggle.

## 6. Stack and Cluster

Status: built (WEB-54). Native `<div>`, or the element named by `as`. Server-safe.

| Part      | What it is               | Props                                                                                                                                                                                                                                                                                                                           |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Stack`   | Vertical grid with a gap | `gap?: 1 to 8`, default `4`, maps to `--space-*`. `as?: "div" \| "section" \| "ul" \| "ol" \| "nav"`                                                                                                                                                                                                                            |
| `Cluster` | Wrapping flex row        | `gap?: 1 to 8`, default `3`. `columnGap?: 1 to 8`: when set, `gap` becomes the row gap and this is the column gap. `align?: "start" \| "center" \| "end"`, default `center`. `justify?: "start" \| "center" \| "between" \| "end"`, default `start`. `as?: "div" \| "section" \| "ul" \| "ol" \| "nav" \| "footer" \| "header"` |

Props render as data attributes (`data-gap="4"`, `data-column-gap`, `data-align`, `data-justify`). They never render as inline styles. Component tokens: `--stack-gap`, and `--cluster-gap`, `--cluster-column-gap`, `--cluster-align`, `--cluster-justify`.

## 7. PageShell

Status: built (WEB-54). Native `<section>`. Server-safe. The root layout already renders `<main>`, so PageShell never does.

Compound part: `PageShell.Root` (the page column, a `<section>`) and `PageShell.Header` (a `<header>` that holds a `Heading` and an optional lead `Text`).

| Prop (Root) | Type                           | Notes                                                                                                                                                                                                                                |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `width`     | `"form" \| "content" \| "fit"` | Default `"content"`. `form` and `content` cap the column (`--measure-form`, `--measure-content`) inside the page padding, and centre the items. `fit` has no cap: the column is as wide as its widest item. Rendered as `data-width` |
| `align`     | `"start" \| "center"`          | Default `"start"`. Where the content sits in the page height. Rendered as `data-align`                                                                                                                                               |
| `gap`       | `"m" \| "l"`                   | Default `"m"` (`--space-4`). `l` is `--space-6`. Rendered as `data-gap`                                                                                                                                                              |
| `text`      | `"start" \| "center"`          | Default `"start"`. `center` centres the text of every item. Rendered as `data-text`                                                                                                                                                  |

`PageShell.Header` always centres its own text and items.

Component tokens: `--shell-measure`, `--shell-columns`, `--shell-content`, `--shell-items`, `--shell-align`, `--shell-gap`, `--shell-text-align`.

## 8. VisuallyHidden and SkipLink

Status: built (WEB-54). Native. Server-safe.

`VisuallyHidden`: a `<span>` that hides its content visually and keeps it for screen readers. It adds no props. It is the one place `1px` is allowed in a module (the clip rule).

`SkipLink`: an `<a>` that is the first focusable element on a page. It stays off-screen until it has focus, then shows above the page (`--z-skip`). It takes a required `href` and `children`. The root layout renders it with the text "Skip to content". Component tokens: `--skip-bg`, `--skip-fg`.

## 9. ToggleGroup

Status: built (WEB-54). Native. Server-safe. It holds no state: the feature decides which item is pressed. ThemeToggle is the first user.

Compound part: `ToggleGroup.Root` and `ToggleGroup.Item`.

| Part   | Element                  | Props                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Root` | `<fieldset>`             | `legend: ReactNode`, required. Rendered inside a `<legend>` through `VisuallyHidden`, so it names the group for screen readers only. `children: ReactNode` is required. It draws the pill frame                                                                                                                                           |
| `Item` | `<button type="button">` | Pass `aria-pressed` to say whether it is on. The part also sets `data-pressed="true"` when it is. `aria-disabled` and `aria-describedby` pass through. A check mark always takes its space (shown by opacity), so nothing shifts when an item is pressed. It has the pressed look, the forced-colours `Highlight` rule and `--target-min` |

Keyboard: each item is its own Tab stop, and there are no arrow-key moves. A native fieldset of buttons works with JavaScript off. Base UI's and shadcn's ToggleGroup change that (one Tab stop and arrow keys), so we didn't use them.

Component tokens: `--toggle-group-bg`, `--toggle-group-border`, `--toggle-item-fg`, `--toggle-item-hover-border`, `--toggle-item-pressed-bg`, `--toggle-item-pressed-fg`.

## 10. Card

Status: planned. The first story that shows a framed item builds it, most likely FEED-13's abiding. Native `<article>` or `<section>`. Server-safe.

Compound part: `Card.Root`, `Card.Header`, `Card.Body`, `Card.Footer`. Takes `variant: "flat" | "raised"` and `as`.

Component tokens: `--card-bg`, `--card-border`, `--card-radius`, `--card-padding`, `--card-shadow`.

## 11. Dialog and AlertDialog

Status: planned. The first story with a modal builds it, most likely FEED-16's thread modal (an intercepting route). **FEED-16 also adds `@base-ui/react` to `package.json`.** No earlier part uses it. Base UI `Dialog` and `AlertDialog`. Needs `"use client"`.

Compound part, following Base UI's anatomy: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Popup` (includes the portal and backdrop), `Dialog.Title`, `Dialog.Description`, `Dialog.Close`.

Owns: focus moving in and returning, Escape, the inert background, scroll lock, and the open and close styles through `[data-starting-style]` and `[data-ending-style]`.

Component tokens: `--dialog-bg`, `--dialog-radius`, `--dialog-padding`, `--dialog-max-width`, `--backdrop-bg`, `--z-dialog`.

Use `AlertDialog` for anything destructive that needs a clear yes or no. Check how the exit animation behaves inside a `<ViewTransition>` before you rely on it (see `base-ui.md`).

## 12. Later parts

Build these when a story needs them, using the same rules: Popover and Menu (Base UI), Toast (Base UI, for "abiding posted"), Tooltip (Base UI), Select and Combobox (Base UI, for hashtag pickers), Tabs, Avatar and Skeleton (native).
