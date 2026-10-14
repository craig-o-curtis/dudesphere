# WEB-6: Design tokens, fonts, root layout and motion rules

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: WEB-5.

**Scope:** One set of CSS variables defines every color, space, radius, font and duration in light and dark, the root layout loads the fonts and the non-affiliation footer, and every animation in the app follows one set of motion rules with a `prefers-reduced-motion` branch.

## Gap

The shell from WEB-5 has no visual system. Without tokens, each page story would pick its own colors and timings, dark mode would need a second pass over every component, and reduced motion would be patched in one page at a time. The app also needs its legal footer before the first public page ships.

## Scope

- `apps/web/src/styles/tokens.css`, imported once from `globals.css`:
  - Colors on `:root`: `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-accent` (lane neon), `--color-accent-2` (rug red), `--color-danger` (foul red), `--color-success`, `--color-focus`, `--color-border`.
  - Dark values under `@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`, so a member's choice beats the system.
  - Space scale `--space-1` to `--space-8` (4 px base). Radii `--radius-s`, `--radius-m`, `--radius-pill`.
  - Type scale `--text-xs` to `--text-3xl` with `clamp()`.
  - Motion: `--dur-fast: 150ms`, `--dur-base: 200ms`, `--dur-slow: 250ms`, `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`.
  - Under `@media (prefers-reduced-motion: reduce)`: every `--dur-*` becomes `0.01ms`.
- `apps/web/src/styles/globals.css`: reset, `body` background and text from tokens, `:focus-visible` outline in `--color-focus` at 3 px, `@starting-style` enter rule for `.enter`.
- `apps/web/src/app/layout.tsx`:
  - Fonts through `next/font/google`: one display face for headings, one text face, `display: "swap"`, exposed as `--font-display` and `--font-text`.
  - `<html lang="en">` with `data-theme` read from a `theme` cookie inside a Suspense boundary. With no cookie, the system setting rules.
  - A skip link "Skip to content" as the first focusable element.
  - `<SiteFooter />` with the disclaimer below.
- `apps/web/src/components/SiteFooter/SiteFooter.tsx` and `.module.css`. Footer copy:

  > Dudesphere is a fan community inspired by The Big Lebowski. It is not affiliated with the film, its makers or Universal, nor with Dudeism and the Church of the Latter-Day Dude.

- `apps/web/src/components/ThemeToggle/`: a Server Action `setTheme(theme: "light" | "dark" | "system")` writes the `theme` cookie for one year.
- `apps/web/src/lib/motion.ts`: `usePrefersReducedMotion()` hook over `matchMedia`, and the shared `motion/react` transition presets that read the tokens.
- Add `motion` (for `motion/react`) to `apps/web/package.json`.

## Design notes

- **150 to 250 ms, ease-out.** Nothing longer, except the strike and the signature moves of later stories, which each state their own reduced-motion branch.
- **Never block input.** A button responds on press, not after its animation.
- **CSS first, then Motion.** Enter animations that need no script use `@starting-style`. `motion/react` handles layout animations and gestures only.
- **Every animation has a reduced-motion branch.** The token switch covers CSS. `motion/react` presets read `usePrefersReducedMotion()` and swap movement for a 150 ms opacity change.
- **Text never sits on a raw photo.** Cards over any backdrop carry `--color-surface` or a frosted surface, so contrast holds (checked again in WEB-47).
- **No film stills, no film fonts, no logos.** The look is "bowling alley, 1991, Los Angeles", built from original type, color and pattern.
- **`cookies()` only inside Suspense.** The theme read sits in a Suspense boundary so the layout stays part of the static shell.

## Rendering strategy

The root layout is part of the static shell. The theme cookie is read inside a Suspense boundary, so only that small attribute streams at request time. This is the first use of "read request data inside Suspense" that every later page copies.

## Verification

- Light, dark and system each render with the right tokens. The toggle survives a reload.
- With the OS set to reduce motion, no element moves. Opacity changes still show state.
- Tab from the top of any page: the skip link is first and visible on focus.
- Every token pair used for text passes WCAG 2.2 AA contrast (4.5:1 body, 3:1 large text) in both themes.
- `next build` passes; the layout reports no "cookies outside Suspense" error.
- The footer disclaimer shows on every page.

## Done when

- [ ] `tokens.css` and `globals.css` with light, dark and reduced-motion branches
- [ ] Root layout with fonts, skip link, theme cookie in Suspense and the footer
- [ ] `ThemeToggle` Server Action
- [ ] `lib/motion.ts` presets and hook
- [ ] Contrast checked for every text pair in both themes
- [ ] Row added to `rendering-strategies.md`
