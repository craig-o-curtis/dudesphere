# Wrapping Base UI

Base UI (`@base-ui/react`) gives us behaviour and accessibility with no styles. We style it with CSS Modules and our tokens. Its docs: https://base-ui.com. Before you rely on any detail below, check it against the installed version with `npx ctx7@latest docs /mui/base-ui/<version> "<question>"`. These notes were checked against v1.9.0.

**Base UI is not installed yet.** FEED-16 adds `@base-ui/react` with Dialog, the first part that needs real behaviour. WEB-54 built every shared part on native HTML, so no part uses it today. Check `apps/web/package.json` before you follow anything below.

## Where it is allowed

- Only files in `src/components/ui/` import `@base-ui/react`.
- Import each component from its own path, which keeps the bundle small: `import { Dialog } from "@base-ui/react/dialog";`.
- Any file that imports Base UI starts with `"use client"`.
- Use it only where behaviour is hard: Dialog, Alert Dialog, Popover, Menu, Select, Combobox, Toast and Tooltip. Plain buttons, links, text, layout, and Form and Field stay native.

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

## Field and Form are native

Our forms are Server Actions with `useActionState` that show Nest's field errors from the 400. We use no form library: `context/audits/forms-analysis.md` explains why, and when TanStack Form may come in. `Form` and the composed fields (`TextField`, `EmailField` and the rest) are our own native parts. See `parts.md` section 3. Base UI 1.9.0's `Form` and `Field` were checked on 2026-10-15 and rejected, for two findings:

- **`Form` always renders `noValidate`** (`form/Form.js:95`). That turns off the browser's own checks (`required`, `pattern`, `minlength`) with JavaScript off. Our `Form` never sets it.
- **`Field.Description` and `Field.Error` add their ids in a layout effect** (`FieldDescription.js:41`, `FieldError.js:71`). The server HTML then has no `aria-describedby` link to the hint or the error. Our fields make their ids with `useId` during render, so the links are in the server HTML.

Base UI's `Form` also selects the first invalid input's text after a failed submit. Ours moves focus there and leaves the text alone.

A Vitest spec renders the forms with `renderToString` and checks the server HTML. This proves what a Playwright test can't yet, because Next bug vercel/next.js#99756 gives a blank page with JavaScript off.

If a later Base UI part needs form wiring, do not bring Base UI's `Form` back in. Build it on `useField` (`ui/Field/useField.ts`).

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
