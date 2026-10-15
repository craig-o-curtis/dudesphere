---
name: ui-composition
description: Build or audit UI in apps/web from small shared parts (Button, Text, TextField, Card, Stack, Dialog and so on) styled with CSS Modules and the WEB-6 design tokens, with Base UI behind the parts that need real behaviour. Use whenever you add or change a component, page or .module.css in apps/web, before you write a button, input, heading, surface, layout wrapper or dialog by hand, and whenever you review web code for duplication, raw CSS values or components that can't be adjusted from outside.
---

# UI composition for apps/web

The web app is built from two kinds of component. **Shared parts** in `src/components/ui/` know how things look and behave. **Feature components** in `src/components/` and the pages put shared parts together and own the data, state and copy. Each look is written once. Every change to a look happens in one place.

Why: by AUTH-7 the app had 10 components and already repeated itself. The sign-in and sign-up CSS files were identical for 83 lines, and field markup had been copied six times. See `context/audits/frontend-audit.md`.

This skill works alongside:

- `vercel-composition-patterns` for general React composition: compound components, no boolean props, explicit variants, and `children` over render props. Its examples use React Native names (`onPress`, `TextInput`). Read them as `onClick` and `<input>`.
- `better-accessibility` for the WCAG detail each part must get right.
- `nextjs-app-architecture` for where feature code lives and where the client boundary sits.

## Rules that always apply

1. **Look before you build.** Before you write a button, field, text style, surface, layout wrapper or dialog, check `src/components/ui/` and `references/parts.md`. Use the shared part. If it doesn't quite fit, extend it with a new variant or a new component token. Don't copy it.
2. **Shared parts know nothing about the app.** No data fetching, no Server Actions, no routes, no member-facing copy. A feature component's `.module.css` holds layout only: where its parts sit (grid areas, gaps, order), never how they look (colour, border, type, radius).
3. **The rule of two.** When the same markup, or the same three or more declarations, shows up a second time, extract it before the task is done. Extract into `ui/` if it is a look. Extract into `src/lib/` if it is logic, such as a pattern constant or a URL helper. Either way, give it a spec.
4. **Tokens in three tiers.** Base tokens (`--space-3`, `--radius-m`) feed role tokens (`--color-surface-raised`, `--color-danger`). Role tokens feed component tokens, which are set at the top of the part's own module (`--button-bg: var(--color-accent)`). A part's rules read only its own component tokens. No raw `px`, `rem`, hex, font weight, line height, z-index or duration in any module. `0`, `100%`, `1fr` and `auto` are fine. See `references/tokens.md`.
5. **Open to adjustment, closed to rewriting.** Every shared part:
   - accepts `className`, and merges it with its own class through `cx()`;
   - passes the native props of its root element through (`...rest`);
   - takes `ref` as an ordinary prop (React 19, no `forwardRef`).

   Change a part's look in one of two ways only. Either pass a `variant` or `tone` prop, which the part renders as `data-variant` or `data-tone`, or pass a class that sets the part's component tokens. Never target a part's inner classes from outside.

6. **Explicit variants, not boolean piles.** Write `variant="primary" | "secondary" | "quiet"`, not `primary`, `outline` and `small` booleans. When variants differ in structure, not just look, make separate components that share inner parts (`vercel-composition-patterns` › `patterns-explicit-variants`).
7. **Compound parts for structure.** Anything with more than one region is a compound component whose parts share context: `Card.Root`, `Card.Header`, `Card.Body`; `Dialog.Root`, `Dialog.Trigger`, `Dialog.Popup`; `ToggleGroup.Root`, `ToggleGroup.Item`. Forms are not compound: they use small building blocks (`Label`, `TextInput`, `ErrorMessage`) and composed fields (`EmailField`) that take props. Parts take `children`, not `renderX` props. Read context with `use()`, not `useContext()`.
8. **Native first, Base UI for behaviour.** Buttons, links, text, headings, layout, and Form and Field are plain HTML and stay native. Form and Field are native because Base UI's `Form` always sets `noValidate` and its `Field` links the hint and error in a layout effect, which both break the form with JavaScript off (`references/base-ui.md`). Use Base UI (`@base-ui/react`) only where the behaviour is hard to get right: Dialog, Alert Dialog, Popover, Menu, Select, Combobox, Toast and Tooltip. The dependency is not installed yet. FEED-16 adds it with Dialog. Wrap each Base UI part once, in `ui/`. Feature code never imports `@base-ui/react`. See `references/base-ui.md`.
9. **Keep the client boundary low.** A shared part gets `"use client"` only when it needs state, effects or Base UI. Server Components render native parts directly.
10. **Each part owns its accessibility.** The part handles focus styles, the 24 px minimum target, the control height, forced-colours borders, `aria-invalid` and `aria-describedby` wiring, pending states, and live regions. A feature using the part can't forget them. An accessibility fix goes in the part, never in the feature.
11. **Motion attaches at the seams.** Parts expose state as data attributes (`data-variant`, `data-pending`, and Base UI's `data-open`, `data-starting-style`, `data-ending-style`). `3d-animator` hangs motion on those. Shared parts never import `motion/react`. When a part needs to animate, Base UI's `render` prop accepts a `motion.*` element from the feature.
12. **Every shared part has a spec, written first.** It checks the role and accessible name, the `className` merge, the `data-variant` or `data-tone` value, that `...rest` and `ref` reach the root, and the accessibility wiring. See `references/testing.md`.

## Workflow

Follow these steps for every UI task.

1. **List the pieces.** Write down each visible piece the task needs: buttons, fields, text styles, surfaces, layout, notices, dialogs.
   ✓ Every piece is named.
2. **Match each piece to a shared part.** Use `references/parts.md`. Mark each piece as **reuse**, **extend** (a new variant or token) or **new**.
   ✓ Nothing is marked new when an existing part could take a variant.
3. **Build missing parts first, test first.** Write the part's spec in `ui/<Name>/<Name>.spec.tsx`, then `<Name>.tsx` and `<Name>.module.css`. Update `references/parts.md` so it shows the part as built.
   ✓ The spec passes. The part meets rules 4, 5, 10 and 12.
4. **Compose the feature.** The feature imports parts from `@/components/ui/<Name>/<Name>`. Its own module, if it has one, holds only layout.
   ✓ No colour, border, radius, type or shadow declarations in the feature's module.
5. **Check the diff.** Run the commands in `references/audit.md` against the files you touched.
   ✓ No raw values. No block of three or more declarations repeated. No `@base-ui/react` import outside `ui/`.
6. **Report.** List each shared part you added or extended, and any part you needed but left for later.

## Verify before you're done

- [ ] Every button, field, heading, text style, surface and dialog in the diff comes from `ui/`
- [ ] No module in the diff holds a raw size, colour, weight, line height, z-index or duration
- [ ] Each new or changed part accepts `className`, `...rest` and `ref`, and changes look only through `variant`, `tone` or component tokens
- [ ] Each new or changed part has a spec that ran green
- [ ] `references/parts.md` is up to date
- [ ] No feature file imports `@base-ui/react`
- [ ] No two files in the diff share three or more identical declarations

## References

| File                        | Read it when                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `references/parts.md`       | You need a part: the catalogue, each part's props, variants, tokens and status             |
| `references/tokens.md`      | You add or change a token, or a part needs a value that has no token                       |
| `references/base-ui.md`     | You wrap a Base UI part: styling, the `render` prop, why Field and Form are native, motion |
| `references/css-modules.md` | You write a part's `.module.css`                                                           |
| `references/testing.md`     | You write a part's spec, or a feature spec that uses parts                                 |
| `references/audit.md`       | You review a diff, or refresh `context/audits/frontend-audit.md`                           |
