# Wrapping Base UI

Base UI (`@base-ui/react`) gives us behaviour and accessibility with no styles. We style it with CSS Modules and our tokens. Its docs: https://base-ui.com. Before you rely on any detail below, check it against the installed version with `npx ctx7@latest docs /mui/base-ui/<version> "<question>"`. These notes were checked against v1.9.0.

WEB-54 adds the dependency. Until then, no part uses it.

## Where it is allowed

- Only files in `src/components/ui/` import `@base-ui/react`.
- Import each component from its own path, which keeps the bundle small: `import { Dialog } from "@base-ui/react/dialog";`.
- Any file that imports Base UI starts with `"use client"`.
- Use it only where behaviour is hard: Dialog, Alert Dialog, Popover, Menu, Select, Combobox, Toast, Tooltip, and Field and Form. Plain buttons, links, text and layout stay native.

## Styling

Pass a CSS Module class to each part through `className`:

```tsx
<Dialog.Popup className={styles.popup}>
```

`className` can also be a function of the part's state. Prefer data attributes in CSS. Use the function only when CSS can't express the condition.

```tsx
<Switch.Thumb className={(state) => (state.checked ? styles.on : styles.off)} />
```

Each part sets data attributes for its state. Style them in the module:

```css
.popup[data-open] { … }
.control[data-invalid] { --input-border: var(--color-danger); }
.item[data-disabled] { … }
```

Each part's attributes are listed in its API reference. The common ones are `data-open`, `data-closed`, `data-disabled`, `data-invalid`, `data-valid`, `data-touched`, `data-dirty`, `data-filled`, `data-focused`, `data-starting-style` and `data-ending-style`.

## The `render` prop

`render` replaces the element a part renders, or merges the part into another component. It is Base UI's version of Radix's `asChild`.

```tsx
<Dialog.Trigger render={<Button variant="primary" />}>Open</Dialog.Trigger>
```

Use it to put our own `Button` inside a trigger, so there is one button style. If the rendered element isn't a `<button>`, set `nativeButton={false}` where the part has that prop.

## Field and Form with Server Actions

Our forms are Server Actions with `useActionState` that show Nest's field errors from the 400. We use no form library: `context/audits/forms-analysis.md` explains why, and when TanStack Form may come in. Base UI's `Form` takes those errors directly:

```tsx
"use client";
import { Form } from "@base-ui/react/form";
import { Field } from "@base-ui/react/field";

const [state, formAction] = useActionState(signIn, initialState);

<Form action={formAction} errors={state.fieldErrors}>
  <Field.Root name="password">
    <Field.Label>Password</Field.Label>
    <Field.Control type="password" />
    <Field.Error />
  </Field.Root>
</Form>;
```

- `errors` is keyed by each `Field.Root`'s `name`.
- Our `AuthFieldErrors` holds `string[]` for each field. Check whether `errors` accepts an array or needs a string, and adapt it in one place: our `Field` wrapper or a helper in `lib/`. Never adapt it in each form.
- `Field.Error match="valueMissing"` (and the other `ValidityState` keys) shows a message for one browser check. `match={true}` always shows it, for errors we control ourselves.

**Prove the forms work with JavaScript off.** A form must still submit, and show the server's field errors, with JavaScript off. Base UI's docs don't say whether `Form` errors are in the server-rendered HTML. WEB-54 must show this with a Playwright test that turns JavaScript off. If the errors don't render, our `Field.Error` falls back to rendering the server error itself.

## Motion

Two documented ways, both of which keep the motion code out of `ui/`.

1. **CSS transitions.** Base UI sets `data-starting-style` as a popup opens and `data-ending-style` as it closes, and waits for the transition to finish before it unmounts. Wrap the transition in `@media (prefers-reduced-motion: no-preference)`.

   ```css
   .popup {
     @media (prefers-reduced-motion: no-preference) {
       transition:
         opacity var(--dur-base) var(--ease-out),
         transform var(--dur-base) var(--ease-out);
     }
   }
   .popup[data-starting-style],
   .popup[data-ending-style] {
     opacity: 0;
     transform: scale(0.96);
   }
   ```

2. **`motion/react`.** Control `open` with state, wrap the portal in `AnimatePresence`, set `keepMounted` on the portal, and pass a `motion.div` through the popup's `render` prop. This belongs to `3d-animator`. The shared part must accept `render` so the feature can pass it in.

**Open question:** neither library documents how a Dialog's exit animation behaves inside React's `<ViewTransition>`. Test it in the first story that puts a Dialog on a route that transitions (most likely FEED-16).

## Wrapping pattern

```tsx
// apps/web/src/components/ui/Dialog/Dialog.tsx
"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";

import { cx } from "@/lib/cx";

import styles from "./Dialog.module.css";

// Our wrappers take a string className only, so cx() can merge it.
type PopupProps = Omit<BaseDialog.Popup.Props, "className"> & { className?: string };

function Popup({ className, children, ...rest }: PopupProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={styles.backdrop} />
      <BaseDialog.Popup className={cx(styles.popup, className)} {...rest}>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Popup,
  Title: BaseDialog.Title,
  Description: BaseDialog.Description,
  Close: BaseDialog.Close,
};
```

- Re-export the parts that need no styles as they are. Wrap only the ones we style.
- Our wrappers accept only a string `className`, as `PopupProps` shows. Base UI's function form stays inside `ui/`, where a part may use it on its own elements.
