# WEB-54: Shared UI parts and the auth form refactor

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: AUTH-7.

**Scope:** Build the first set of shared UI parts in `apps/web/src/components/ui/`, on the WEB-6 tokens, with Base UI behind Field and Form. Then move every existing component and page onto them. After this story, each look in the app is written once, and later stories build by composing parts instead of copying CSS.

## Gap

By AUTH-7 the app had 10 components and no shared parts. `context/audits/frontend-audit.md` lists the cost:

- The sign-in and sign-up stylesheets are identical for 83 lines.
- Field markup, with its ARIA wiring, is copied six times in two different styles.
- The button is written three times, the page layout and title three times, and muted helper text four or five times.
- `44px`, `24px`, `1px` borders and `font-weight: 700` are hard-coded 7 to 10 times each, because no token covers them.
- No component accepts `className` or `variant`.

AUTH-9 adds two more forms, and Phase 1 adds many more screens. Fixing this now costs one story. Fixing it later costs one per screen.

The rules for the parts are in `.agents/skills/ui-composition/`. This story is the first one built under them.

## Scope

**Dependency:** add `@base-ui/react` to `apps/web`. Check the current version and API with `npx ctx7@latest docs /mui/base-ui` before you use it.

**Tokens** (`src/styles/tokens.css`): add `--control-min-height`, `--target-min`, `--border-width`, `--font-weight-bold`, `--tracking-tight`, `--leading-tight`, `--leading-body`, `--measure-form`, `--measure-content`, `--opacity-pending` and `--z-skip`, as listed in `ui-composition/references/tokens.md`. Replace every raw use. Add the `themeColor` hex in `app/layout.tsx` to `tokens.spec.ts`. Decide which of the 8 unused tokens to keep.

**Helper:** `src/lib/cx.ts`, with a spec.

**Shared parts**, each with a spec written first, following `ui-composition/references/parts.md`:

- `Text`, `Heading`, `InlineLink`, `VisuallyHidden`
- `Button`, `ButtonLink`
- `Field` (Root, Label, Control, Hint, Error) and `FormAlert`, on Base UI Field and Form
- `Stack`, `Cluster`, `PageShell`, `Notice`

**Refactor** onto the parts, with no change to what members see or hear:

- `SignInForm` and `SignUpForm`, including a shared `AuthForm` layout component for their common frame (alert, `NextPathField`, the alt line and `CookieNote`)
- `SessionCorner`, `ThemeToggle`, `CookieNote`, `SiteFooter`, `SkipLink`
- `app/page.tsx`, `app/(public)/login/page.tsx`, `app/(public)/signup/page.tsx`

**Smaller fixes** from the audit:

- Move `EMAIL_PATTERN` and its `title` text into `lib/`, defined once.
- Use `AuthField` instead of the retyped field-name union.
- Move `loginHref` into `lib/next-path.ts`.
- Give `hooks/useFocusFirstInvalid.ts` a spec.
- Make the SessionCorner comment match the `<output>` it uses, and stop using a fixed id for its hint.
- Delete the `margin: 0` and `font: inherit` lines that repeat the global reset.

## Not in scope

- `Card`, `Dialog`, `AlertDialog`, `Popover`, `Menu`, `Toast`, `Tooltip`, `Select` and `Combobox`. The first story that needs each one builds it under the same rules. FEED-13's abiding will most likely need `Card`, and FEED-16's thread modal `Dialog`.
- Any visual redesign. Every page should look the same before and after, apart from small fixes the audit names, such as the missing forced-colours border on the SessionCorner button.
- Motion. Parts expose data attributes. `3d-animator` uses them later.

## Design notes

- **Forms stay on Next.js form actions.** Each form is a Server Action with `useActionState`, as in AUTH-7. Add no form library. `context/audits/forms-analysis.md` compares React Hook Form, Next.js form actions and TanStack Form, and says when TanStack Form may come in. `Field` takes `state.errors` through Base UI `<Form errors>`, and also accepts `invalid` and `errors` props directly, so a form library could drive it later without changing the part.
- **Native first.** Only `Field` and `FormAlert` touch Base UI in this story. `Button`, `Text`, `Heading` and the layout parts are plain HTML and stay safe for Server Components.
- **Forms must keep working with JavaScript off.** They must still submit and still show Nest's field errors. Base UI's docs don't say whether `Form` errors render on the server. Prove it with a Playwright test that turns JavaScript off. If they don't render, `Field.Error` falls back to rendering the server error itself.
- **Specs stay green.** Existing specs query by role and text, so they should pass with few changes. `ThemeToggle.spec.tsx:347` checks a class name and will need rewriting.
- **`references/parts.md` is updated in the same change.** Mark each part "built (WEB-54)".

## Rendering strategy

No change. Each page keeps its current strategy and row in `rendering-strategies.md`. The parts add no new request-time data. Check with `next build` that the static pages stay static.

## Verification

- `pnpm --filter @dudesphere/web test` passes, including a spec for every new part and for `cx`.
- The `ui-composition` audit checks 1 to 5 and 9 find nothing outside `components/ui/`.
- `diff` of any two feature modules shows no shared block of three or more declarations.
- Sign up, sign in, sign out and sign out everywhere still work in the browser, by keyboard only, with JavaScript off, and with `prefers-reduced-motion: reduce`.
- The axe scan in the AUTH-7 Playwright flows still passes, in light and dark.
- `next build` reports the same static and dynamic routes as before.

## Done when

- [ ] `@base-ui/react` added, and the new tokens in `tokens.css`
- [ ] `lib/cx.ts` and every part in the Scope list built in `components/ui/`, each with a spec
- [ ] Every component and page in the Scope list moved onto the parts
- [ ] The smaller fixes done
- [ ] Playwright check that the auth forms show server errors with JavaScript off
- [ ] `ui-composition/references/parts.md` and `context/audits/frontend-audit.md` updated to show what is fixed
