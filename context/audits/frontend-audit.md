# Frontend audit: shared UI parts

Audited on 2026-10-15, against the AUTH-7 branch (`41-auth-7-bff-sign-up-sign-in-and-sign-out-with`) with its uncommitted work. AUTH-7 was still changing during the audit, so line numbers may drift by a few lines. Paths are relative to `apps/web/src/`.

The rules these findings are judged against are in `.agents/skills/ui-composition/`. Story WEB-54 fixes them.

## Summary

The tokens are in good shape. No module uses a raw colour, and every colour goes through a WEB-6 token.

The problem is that the app has no shared UI parts. Every component writes its own button, input, field, error text, helper text and page layout. With only 10 components, the same CSS and markup already appear two to six times. No component accepts `className` or `variant`, so none can be adjusted from outside, and copying is the only way to reuse a look.

The fix is a small set of shared parts in `components/ui/`, a few new tokens, and Base UI behind the parts that need real behaviour.

## Culprits, worst first

### 1. The two form stylesheets are the same file

`components/SignInForm/SignInForm.module.css` (83 lines) and the first 83 lines of `components/SignUpForm/SignUpForm.module.css` are identical. `diff` finds no difference. Both hold `.wrap`, `.form`, `.field`, `.label`, `.input`, the invalid state, `.error`, `.formError`, `.button`, the pending state, `.alt`, `.alt a` and the forced-colours block.

**Fix:** `Field`, `Button`, `FormAlert`, `Stack` and `InlineLink`. Each form's module then holds only its layout, or goes away.

### 2. Field markup is copied six times, wired two ways

- `components/SignInForm/SignInForm.tsx:41` and `:66`: identifier and password.
- `components/SignUpForm/SignUpForm.tsx:89`, `:110`, `:136` and `:161`: email, display name, username and password.

Each copy builds its own label, input, hint and error, and its own `aria-invalid` and `aria-describedby`.

- SignInForm keeps an id variable for each field and writes the ARIA inline.
- SignUpForm writes three helpers, `describedBy()`, `invalid()` and `errorFor()` (`SignUpForm.tsx:54-68`). Each one retypes `"email" | "displayName" | "username" | "password"` instead of using `AuthField` from `lib/actions/auth-state.ts:9`.

**Fix:** a `Field` compound part on Base UI `Field` and `Form`. It wires the ids and ARIA itself, and takes the server's field errors through the form's `errors` prop.

### 3. The button is written three times

```css
/* SignInForm.module.css:50, SignUpForm.module.css:50, SessionCorner.module.css:41 */
min-block-size: 44px;
min-inline-size: 24px;
padding: var(--space-2) var(--space-4);
border: 1px solid …;
border-radius: var(--radius-m);
background: …;
color: …;
font: inherit;
font-weight: 700;
cursor: pointer;
```

Also:

- The pending guard is copied in JSX. Both `SignInForm.tsx:91-99` and `SignUpForm.tsx:189-197` repeat `aria-disabled={pending ? true : undefined}` and an `onClick` that calls `preventDefault()`.
- The forced-colours border fix is in both forms but missing from the SessionCorner button.
- SessionCorner styles its "Sign in" and "Sign up" links as buttons (`.link`, `SessionCorner.module.css:10`).

**Fix:** `Button` with `variant` and `pending`, and `ButtonLink`. The forced-colours rule is then written once, inside the part.

### 4. The page layout and title are written three times

```css
/* app/(public)/login/page.module.css:1 and app/(public)/signup/page.module.css:1 are identical */
display: grid;
flex: 1;
gap: var(--space-6);
justify-items: center;
align-content: start;
padding: var(--space-8) var(--space-4);

/* .title in all three page modules */
font-size: var(--text-3xl);
letter-spacing: -0.02em;
line-height: 1;
```

`app/page.module.css:1` is a variant of the same layout.

**Fix:** `PageShell` and `Heading`.

### 5. Muted helper text is written four or five times

`margin: 0; color: var(--color-text-muted); font-size: var(--text-sm);` appears in:

- `components/CookieNote/CookieNote.module.css:1`
- `components/SessionCorner/SessionCorner.module.css:54` (`.hint`)
- `components/SignUpForm/SignUpForm.module.css:85` (`.hint`)
- `components/ThemeToggle/ThemeToggle.module.css:90` (`.hint`, with `--text-xs`)

A near copy is in `app/page.module.css:20` (`.note`).

**Fix:** `Text` with `tone="muted"` and `size`.

### 6. Values with no token

| Value                                             | Uses | New token                                |
| ------------------------------------------------- | ---- | ---------------------------------------- |
| `44px` control height                             | 7    | `--control-min-height`                   |
| `24px` target size                                | 10   | `--target-min`                           |
| `1px solid` border                                | 10   | `--border-width`                         |
| `font-weight: 700`                                | 7    | `--font-weight-bold`                     |
| `letter-spacing: -0.02em`                         | 3    | `--tracking-tight`                       |
| `max-inline-size: 28rem`                          | 2    | `--measure-form`                         |
| `opacity: 0.8` (pending)                          | 2    | `--opacity-pending`                      |
| `z-index: 100` (SkipLink)                         | 1    | `--z-skip`                               |
| `40ch`, `60ch`, `20rem` (ThemeToggle, SiteFooter) | 4    | `--measure-content` and component tokens |

`app/layout.tsx:47-48` copies the `--color-bg` values as hex for the `themeColor` metadata. That copy can't use `var()`, so `tokens.spec.ts` should check it matches.

**Fix:** add the tokens (`ui-composition/references/tokens.md`) and replace every raw use.

### 7. The form scaffolding is repeated

- The form-level alert: `<p role="alert" className={styles.formError}>` at `SignInForm.tsx:36` and `SignUpForm.tsx:78`.
- `<Suspense fallback={null}><NextPathField /></Suspense>` at `SignInForm.tsx:87` and `SignUpForm.tsx:185`.
- The "alt" line and `<CookieNote />` at the bottom: `SignInForm.tsx:104-107` and `SignUpForm.tsx:202-208`.
- `EMAIL_PATTERN` is defined twice with the same value (`SignInForm.tsx:21`, `SignUpForm.tsx:33`). Its `title` text is also repeated (`SignInForm.tsx:53`, `SignUpForm.tsx:101`).

**Fix:** `FormAlert`; an `AuthForm` layout component in `components/` for the shared frame of the two auth forms; and `EMAIL_PATTERN` moved into `lib/`, next to the other auth form rules.

### 8. Live regions are built by hand

- `role="alert"` paragraphs in both forms.
- `<output>` in `components/SessionCorner/SessionCorner.tsx:61` and in ThemeToggle. ThemeToggle reserves one line of space so the layout doesn't jump; SessionCorner doesn't.
- `SessionCorner.tsx:44` and `:48` use the fixed id `sign-out-everywhere-hint`. SessionCorner is an async Server Component, so it can't call `useId()`. The id will collide if the corner ever renders twice.

**Fix:** `FormAlert` and `Notice`. Pass the hint id in from a part that can generate it, or link the hint without an id.

### 9. Small helpers live in one component, and resets are repeated

- The visually-hidden rule exists only as `.legend` in `ThemeToggle.module.css:79`.
- `margin: 0` is written 13 times in modules, although `styles/globals.css` already sets `* { margin: 0 }`.
- `font: inherit` is written on every button and input, although `globals.css` already sets it on form controls.

**Fix:** `VisuallyHidden`, and delete the repeated resets.

### 10. Tokens and classes nothing uses

- Eight tokens are never read: `--color-accent-2`, `--color-success`, `--dur-fast`, `--dur-slow`, `--space-5`, `--space-7`, `--text-lg` and `--text-2xl`.
- The global `.enter` class in `styles/motion.css:8` isn't used by any component. No component uses the `motion/react` presets in `lib/motion.ts` yet either. Those wait for `3d-animator` work, so leave them.

**Fix:** decide in WEB-54. Keep the ones a planned story needs, such as `--color-success` for Toast and `--text-2xl` for `Heading`. Remove the rest.

## Smaller findings

- **SignUpForm does too much.** At 211 lines, it mixes the form, copies of the DTO rules, and `?next=` URL logic (`loginHref` and `SignInLinkWithNext`, `SignUpForm.tsx:38-46`). `loginHref` belongs in `lib/next-path.ts`, next to `safeNextPath`.
- **A shared hook has no spec.** `hooks/useFocusFirstInvalid.ts` breaks the rule that shared code has a unit test. It sat in `components/` when the audit started, and AUTH-7 moved it to `hooks/` during the audit. It still needs a spec.
- **A comment doesn't match the code.** `SessionCorner.tsx:18` says "a `role=\"status\"` line", but the code uses `<output>`. `<output>` has the status role, so it works, but the comment should say what the code does.
- **ThemeToggle is long but holds together.** At 192 lines, it handles optimistic state, cross-tab sync and the server action. Its markup should move onto shared parts, but its logic can stay.

## What is fine

- No raw colours anywhere in the CSS Modules.
- The tokens have a spec that checks the two dark blocks and contrast.
- Specs query by role and text, not by class, so moving markup into shared parts won't break them. The one exception is `ThemeToggle.spec.tsx:347`.
- `"use client"` appears only where it is needed.
- Every component has its own folder with its module and spec beside it, which `components/ui/` can copy.

## The fix plan

Story **WEB-54** (`context/epic-lebowski/issues/WEB-54.md`) carries it out, in this order:

1. Add the missing tokens and `lib/cx.ts`.
2. Build `Text`, `Heading`, `InlineLink` and `VisuallyHidden`.
3. Build `Button` and `ButtonLink`.
4. Add `@base-ui/react`, then build `Field` and `FormAlert`. Forms stay on Next.js form actions with no form library (`context/audits/forms-analysis.md`).
5. Build `Stack`, `Cluster`, `PageShell` and `Notice`.
6. Move SignInForm, SignUpForm, SessionCorner, ThemeToggle, CookieNote, SiteFooter and the three pages onto the parts.
7. Fix the smaller findings.
8. Run the `ui-composition` audit checks again. Checks 1 to 5 should find nothing outside `components/ui/`.

`Card` and `Dialog` are left for the first stories that need them: FEED-13's abiding and FEED-16's thread modal.

## Library choice

**Base UI** (`@base-ui/react`, v1.9.0 at the time of the audit) backs the parts that need real behaviour: Field and Form, and later Dialog, Alert Dialog, Popover, Menu, Select, Combobox, Toast and Tooltip. Buttons, text and layout stay plain HTML.

Why Base UI:

- **It ships no styles.** Parts are styled with CSS Modules through `[data-*]` state attributes, so our tokens drive every look and nothing fights them.
- **It covers what we need,** including Field and Form, which take Server Action errors directly through `errors`.
- **Its composition model matches ours.** It uses compound parts, and a `render` prop that lets our own `Button` act as a trigger.
- **Its motion hooks are documented.** It uses `data-starting-style` and `data-ending-style` for CSS, and `keepMounted` with `AnimatePresence` for `motion/react`.
- **It is actively maintained.** It has been stable since 2025-12-11 and releases monthly. MUI builds it, with former Radix and Floating UI maintainers, and it has been shadcn's default base since July 2026.

| Option                | Why not                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| shadcn/ui             | Needs Tailwind, which this repo doesn't allow. Still useful as a reference for how to compose parts on Base UI            |
| Radix Primitives      | Good quality, but there were no releases from August 2025 to June 2026, then a burst of React 19 fixes                    |
| React Aria Components | The strongest accessibility and date handling, but a bigger bundle and a wordier API. The fallback if Base UI falls short |
| Radix Themes, Mantine | Bring their own theme and token systems, which would fight ours                                                           |
| Chakra v3             | Runtime CSS-in-JS, which works poorly with Server Components                                                              |
| Headless UI           | Too few components                                                                                                        |
| No library            | Focus traps, Select, Combobox and Toast would all be our own code to write and test                                       |

**For the 3D world (WORLD-48):** pmndrs uikit draws UI inside the WebGL canvas, with no DOM. Screen readers and keyboard focus can't reach it, so it can't meet WCAG 2.2 AA. Use it at most for decoration inside the scene, with a DOM alternative. To attach real UI to a 3D object, use drei's `<Html>`, which places DOM in the scene, so Base UI parts still work. Dialogs, fields and buttons stay as DOM outside the `<Canvas>`.
