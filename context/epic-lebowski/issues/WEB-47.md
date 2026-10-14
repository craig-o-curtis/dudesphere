# WEB-47: Performance and accessibility pass

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 5. Blocked by: WEB-46.

**Scope:** Every page meets the performance budgets and WCAG 2.2 AA, works with the keyboard alone and under reduced motion, and Partial Prefetching is on for the routes that benefit.

## Gap

Each story checked its own page. Nobody has checked the whole app at once: bundle size across routes, contrast over every backdrop, focus order across layouts, and motion on pages that grew after their story closed.

## Scope

- **Budgets** (enforced in CI where possible):
  - Under 200 KB of JavaScript (compressed) before any lane or canvas chunk, per route. Checked from `next build` output with a script in `apps/web/scripts/check-budgets.ts`.
  - LCP under 2.5 s and INP under 200 ms on a mid-range phone profile over 4G, measured with Lighthouse CI on `/`, `/feed`, `/abidings/[id]`, `/lanes/[id]`.
  - CLS under 0.1 on the same pages.
- **Partial Prefetching:** turn it on in `next.config.ts` for the app, and confirm with WEB-46's `instant()` tests that prefetched shells render at once.
- **Accessibility:**
  - axe: zero serious or critical issues on every page (extend WEB-46's `a11y.spec.ts` to every route in `lab.ts`).
  - Keyboard: every action reachable, visible focus, no traps; dialogs return focus.
  - Contrast: every text and control pair at AA in light and dark; text over any pattern or photo sits on a surface.
  - Screen reader: one manual pass with VoiceOver over sign-in, feed, compose, thread, a Lane Night frame and the Score Sheet.
  - Zoom to 200 percent and a 320 px wide viewport: no horizontal scroll, no clipped controls.
- **Reduced motion:** every page checked under the WEB-46 reduced-motion project; no element translates or scales.
- **Fixes** land in this story. Large findings become new tracker rows.
- `apps/web/README` content goes into `DEVELOPMENT.md`: how to run the budget script and Lighthouse locally.

## Design notes

- **Measure, then fix.** The story starts with a report of every page against every check, then fixes in order of impact.
- **React Compiler is on.** No hand-written `useMemo` or `memo` for performance unless a profile proves the compiler missed it.
- **Fonts.** `next/font` with `display: swap` and subset to Latin; check that no layout shift comes from font swap.

## Rendering strategy

Partial Prefetching is the lesson's last row: the router prefetches each route's static shell, so a navigation shows it at once and streams the rest.

## Verification

- `check-budgets.ts` passes on every route and fails when a 300 KB dependency is imported into the feed (try it, revert).
- Lighthouse CI meets the three Web Vitals targets on the four pages.
- axe passes on every route in `lab.ts`.
- The manual VoiceOver pass notes no blocker.
- 320 px and 200 percent zoom checks pass on the four pages.

## Done when

- [ ] Budget script and Lighthouse CI in the pipeline
- [ ] Partial Prefetching on and verified
- [ ] axe on every route; keyboard, contrast, zoom and VoiceOver passes recorded
- [ ] Reduced-motion check on every page
- [ ] Findings fixed or filed as new rows
- [ ] Row added to `rendering-strategies.md`
