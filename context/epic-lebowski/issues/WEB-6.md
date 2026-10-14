# WEB-6: Design tokens, fonts, root layout and motion rules

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: WEB-5.

**Scope:** One set of CSS variables defines every color, space, radius, font and duration in light and dark, the root layout loads the fonts and the non-affiliation footer, and every animation in the app follows one set of motion rules with a `prefers-reduced-motion` branch.

## Gap

The shell from WEB-5 has no visual system. Without tokens, each page story would pick its own colors and timings, dark mode would need a second pass over every component, and reduced motion would be patched in one page at a time. The app also needs its legal footer before the first public page ships.

## Scope

- `apps/web/src/styles/tokens.css`, imported once from `globals.css`:
  - Colors on `:root`: `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-accent` (lane neon), `--color-on-accent`, `--color-accent-2` (rug red), `--color-danger` (foul red), `--color-success`, `--color-focus`, `--color-border`, `--color-border-strong`.
  - Dark values under `@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`, so a member's choice beats the system.
  - Space scale `--space-1` to `--space-8` (4 px base). Radii `--radius-s`, `--radius-m`, `--radius-pill`.
  - Type scale `--text-xs` to `--text-3xl` with `clamp()`.
  - Motion: `--dur-fast: 150ms`, `--dur-base: 200ms`, `--dur-slow: 250ms`, `--dur-fade: 150ms`, `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`.
  - Under `@media (prefers-reduced-motion: reduce)`: `--dur-fast`, `--dur-base` and `--dur-slow` become `0.01ms`. `--dur-fade` stays at 150 ms, so state changes still fade.
- `apps/web/src/styles/globals.css` (moved from `src/app/`): reset, `body` background and text from tokens, `:focus-visible` outline in `--color-focus` at 3 px.
- `apps/web/src/styles/motion.css`: the `@starting-style` enter rule for `.enter`, and the reduced-motion rule that turns `.enter` and every `::view-transition-*` animation into a fade over `--dur-fade`.
- `apps/web/src/app/layout.tsx`:
  - Fonts: Bowlby One for headings through `next/font/google`, and Atkinson Hyperlegible Next for text, self-hosted (latin subset, with its OFL licence) through `next/font/local` from `apps/web/src/app/fonts/`, so Next builds a size-matched fallback. Both use `display: "swap"` and are exposed as `--font-display` and `--font-text`.
  - `<html lang="en" suppressHydrationWarning>`. A static inline `<head>` script reads the `theme` cookie before paint and sets `data-theme` to `light` or `dark`. With no cookie, the system setting rules.
  - A skip link "Skip to content" as the first focusable element. It targets `<main id="main" tabIndex={-1}>`, which the layout owns. Pages render no `<main>` of their own.
  - `<MotionProvider>` with `<MotionConfig reducedMotion="user">` around the body content.
  - `<SiteFooter />` with the disclaimer below.
- `apps/web/src/components/SiteFooter/SiteFooter.tsx` and `.module.css`. Footer copy:

  > Dudesphere is a fan community inspired by The Big Lebowski. It is not affiliated with the film, its makers or Universal, nor with Dudeism and the Church of the Latter-Day Dude.

  The footer also holds the theme toggle, inside a `<Suspense>` boundary.

- `apps/web/src/components/ThemeToggle/`: Light and Dark toggle buttons in a group named "Theme", each with `aria-pressed`. With no cookie, neither is pressed. They are plain `type="button"` buttons with no form post. A press updates the screen, then calls `setTheme(theme)` directly, and the screen adopts the theme it returns, so two tabs can't drift. A press before hydration does nothing, and the streaming fallback can't act. Pressing the pressed button deletes the cookie, which hands control back to the OS, and a visible hint says so. The pressed state has a non-color cue for forced-colors mode. With JavaScript off, a `<noscript>` style in the layout's `<head>` hides the toggle, and the page follows the OS. `ThemeSetting` reads `cookies()` inside the footer's Suspense boundary to show the current choice.
- `apps/web/src/lib/actions/theme.ts`: a Server Action `setTheme(theme: unknown): Promise<Theme | null>`. For `light` or `dark` it writes the `theme` cookie for one year, or deletes it when the cookie already holds that theme, and returns the saved theme (or `null`). Any other value is rejected.
- `apps/web/src/lib/motion.ts`: the shared `motion/react` transition presets, with timing constants that match the tokens, and a re-export of `useReducedMotion` from `motion/react`.
- `apps/web/playwright.config.ts` and `apps/web/e2e/shell.spec.ts`: a local browser spec for the theme, the skip link, reduced motion and axe. CI wiring waits for WEB-46.
- `motion` (for `motion/react`) is already in `apps/web/package.json` from WEB-5.

## Design notes

- **150 to 250 ms, ease-out.** Nothing longer, except the strike and the signature moves of later stories, which each state their own reduced-motion branch.
- **Never block input.** A button responds on press, not after its animation.
- **CSS first, then Motion.** Enter animations that need no script use `@starting-style`. `motion/react` handles layout animations and gestures only.
- **Every animation has a reduced-motion branch.** The token switch covers CSS movement, and `--dur-fade` keeps fades. `MotionConfig reducedMotion="user"` turns off transform and layout animations in every `motion` component. Presets also read `useReducedMotion()` and swap movement for a 150 ms opacity change.
- **Text never sits on a raw photo.** Cards over any backdrop carry `--color-surface` or a frosted surface, so contrast holds (checked again in WEB-47).
- **No film stills, no film fonts, no logos.** The look is "bowling alley, 1991, Los Angeles", built from original type, color and pattern.
- **`cookies()` only inside Suspense.** The layout never reads `cookies()`, so it stays part of the static shell. `<html>` can't sit inside Suspense, so the inline script sets `data-theme` before paint. That is Next 16.4's own pattern for a theme stored in a cookie. The `theme` cookie is not httpOnly for that reason. It holds no secret.

## Rendering strategy

The root layout is part of the static shell. An inline script sets the theme before paint, so nothing flashes. The footer's theme toggle reads the `theme` cookie inside a Suspense boundary, so only that small control streams at request time. This is the first use of "read request data inside Suspense" that every later page copies.

## Verification

- Light and dark each render with the right tokens. A chosen theme survives a reload.
- With no cookie, the OS theme decides and neither button is pressed. A member's choice beats the OS. Pressing the chosen button again hands control back to the OS.
- No flash of the wrong theme on load, and no hydration warning.
- With the OS set to reduce motion, no element moves. Opacity changes still show state over 150 ms.
- Tab from the top of any page: the skip link is first, visible on focus, and moves focus to `#main`.
- Every token pair used for text passes WCAG 2.2 AA contrast (4.5:1 body, 3:1 large text) in both themes.
- `next build` passes; the layout reports no "cookies outside Suspense" error.
- The footer disclaimer shows on every page.
- With JavaScript turned off, the toggle is hidden and the page follows the OS theme.
- `pnpm --filter @dudesphere/web test:e2e` passes locally.

## Done when

- [ ] `tokens.css`, `globals.css` and `motion.css` in `src/styles/`, with light, dark and reduced-motion branches
- [ ] Root layout with fonts, inline theme script, skip link, `<main>`, `MotionProvider` and the footer
- [ ] `ThemeToggle` in the footer, its cookie read in Suspense, and the `setTheme` Server Action
- [ ] `lib/motion.ts` presets and the `useReducedMotion` re-export
- [ ] Contrast checked for every text pair in both themes
- [ ] Local Playwright spec for the shell
- [ ] Row added to `rendering-strategies.md`
