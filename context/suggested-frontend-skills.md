# Suggested frontend skills

This document lists the skills from skills.sh that fit the Dudesphere web stack. Craig installs the ones he wants by hand.

Compiled on 2026-10-14.

## Method

- About 60 `npx skills find` searches.
- Each skill's SKILL.md was read on GitHub, because skills.sh pages cut text off.
- skills.sh shows only a "first seen" date. "Updated" below means the last commit to the skill's folder.
- Install counts come from skills.sh on 2026-10-14.

## How to install

Short form:

```sh
npx skills add <owner/repo@skill>
```

Long form:

```sh
npx skills add https://github.com/<owner>/<repo> --skill <name>
```

## Our stack, for the fit column

- Next.js 16.4 App Router with Cache Components, Turbopack, React Compiler and proxy.ts. Node runtime only.
- React 19.3.
- CSS Modules and CSS variables. No Tailwind. No component library.
- motion (`motion/react`).
- React Three Fiber, drei and rapier. Postprocessing later.
- SVG and Canvas 2D, next/og and Web Audio.
- TanStack Query v5 for client lists only.
- Vitest, Testing Library and Playwright.
- pnpm workspace, oxlint and oxfmt.
- @northguild/gmt, never Date.
- Accessibility and reduced motion everywhere.

## Recommended, ranked

| Rank  | Install slug                                                                                                                                    | Updated                | Installs        | Fit      | What it covers                                                                                                                                                                                                             | Caveats                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 X   | `vercel/next.js@next-cache-components-adoption`                                                                                                 | 2026-09-28             | 18.6K           | High     | Official guide to turning on Cache Components. Needs Next 16.3+ and Turbopack. Says `dynamic`, `revalidate` and `fetchCache` exports are fatal. Hunts `new Date()` and `Date.now()` as build-blocking calls at render time | It only greps for `Date`, `Math.random` and `crypto.randomUUID`. Any `@northguild/gmt` "now" call at render time would hit the same error and be missed                                       |
| 2 OK  | `vercel/next.js@next-cache-components-optimizer`                                                                                                | 2026-10-06             | 17.1K           | High     | Test-driven loop to make routes load instantly, using `@next/playwright`'s `instant()`                                                                                                                                     | Needs 16.3+ with `cacheComponents: true`                                                                                                                                                      |
| 3 OK  | `vercel/next.js@next-dev-loop`                                                                                                                  | 2026-09-28             | 19.8K           | High     | Checks changes at runtime through `/_next/mcp` and `agent-browser`. Needs 16.3+ with Turbopack. Uses `pnpm next upgrade`                                                                                                   | Asks you to run `npm i -g agent-browser`                                                                                                                                                      |
| 4 OK  | `vercel-labs/agent-skills@vercel-react-view-transitions`                                                                                        | 2026-08-28             | 152.5K          | High     | Covers `<ViewTransition>`, `addTransitionType`, the `transitionTypes` prop on `<Link>` (Next 16.2+) and a reduced-motion CSS recipe. Plain CSS pseudo-elements, no Tailwind                                                | Says not to add the old `experimental.viewTransition` flag                                                                                                                                    |
| 5 OK  | `aurorascharff/nextjs-app-architecture-skill@nextjs-app-architecture`                                                                           | 2026-10-04             | 447             | High     | Next 16 server-component architecture: feature folders, Suspense placement, `'use cache'`, `cacheTag`, `updateTag`, `cacheLife('max')` and ViewTransition. No mention of Tailwind, shadcn, ESLint or Prisma found          | Small install count, but closely matched to the stack                                                                                                                                         |
| 6 OK  | `vercel-labs/agent-skills@vercel-react-best-practices`                                                                                          | 2026-04-14             | 799.9K          | High/Med | 70 performance rules, including Activity, `useEffectEvent`-style patterns and server parallel fetching                                                                                                                     | Rule `client-swr-dedup` pushes SWR, and we use TanStack Query. The `rerender-memo` rules suggest `useMemo` and `memo`, though the rule itself says they are not needed with React Compiler on |
| 7 OK  | `enzed/r3f-skills@r3f-fundamentals` (also `@r3f-physics`, `@r3f-postprocessing`, `@r3f-animation`; `@r3f-loaders` and `@r3f-shaders` exist too) | 2026-08-31             | 1.6K to 3K each | High     | Targets Fiber 9, React 19, Rapier 2 and @react-three/postprocessing 3.1. Says to check installed versions rather than upgrade. Mentions reduced motion                                                                     | None found                                                                                                                                                                                    |
| 8 OK  | `emilkowalski/skills@animate` (pair with `@review-animations`)                                                                                  | 2026-09-15             | 140.9K / 224.7K | High     | Prefers CSS first, then Motion (motion.dev) for springs, layout and exit animations. Reduced motion is mandatory ("gentler, not zero"). Covers `motion/react` performance details                                          | None found                                                                                                                                                                                    |
| 9 OK  | `jakubkrehel/skills@better-accessibility`                                                                                                       | 2026-10-05             | 26.6K           | High     | WCAG 2.2 checks for keyboard, focus, ARIA, forms and live regions. Treats motion as opt-in via `prefers-reduced-motion: no-preference`                                                                                     | None found                                                                                                                                                                                    |
| 10 OK | `currents-dev/playwright-best-practices-skill@playwright-best-practices`                                                                        | 2026-07-21             | 93.3K           | High     | `@playwright/test`: axe-core accessibility checks, date and time mocking, canvas and WebGL, WebSockets, multi-user flows and Web Vitals budgets                                                                            | None found                                                                                                                                                                                    |
| 11 OK | `antfu/skills@vitest`                                                                                                                           | 2026-09-28             | 40.5K           | High     | Vitest config, mocking, fixtures and coverage                                                                                                                                                                              | Does not cover Testing Library specifically                                                                                                                                                   |
| 12 OK | `deckardger/tanstack-agent-skills@tanstack-query-best-practices`                                                                                | 2026-09-09 (repo date) | 12.4K           | Med/High | v5 rules for query keys, mutations, invalidation, optimistic updates and infinite queries                                                                                                                                  | Skip its SSR hydration rules. We use Query for client lists only                                                                                                                              |

## What is installed (2026-10-14)

Craig installed eleven of the twelve, by hand. `skills-lock.json` records each one.

| Skill                             | Status                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next-cache-components-adoption`  | Not installed. Snyk flagged it during install, so Craig left it out. Cache Components is already on in `apps/web`, so the optimizer and the Next docs cover the same ground |
| `next-cache-components-optimizer` | Installed                                                                                                                                                                   |
| `next-dev-loop`                   | Installed                                                                                                                                                                   |
| `vercel-react-view-transitions`   | Installed                                                                                                                                                                   |
| `nextjs-app-architecture`         | Installed                                                                                                                                                                   |
| `vercel-react-best-practices`     | Installed                                                                                                                                                                   |
| `r3f-fundamentals`                | Installed. `@r3f-physics`, `@r3f-postprocessing` and `@r3f-animation` are not, and can wait for WORLD-48                                                                    |
| `animate`                         | Installed. `@review-animations` is not                                                                                                                                      |
| `better-accessibility`            | Installed                                                                                                                                                                   |
| `playwright-best-practices`       | Installed                                                                                                                                                                   |
| `vitest`                          | Installed                                                                                                                                                                   |
| `tanstack-query-best-practices`   | Installed. Skip its SSR hydration rules: the app uses TanStack Query for client lists only                                                                                  |

## Useful but overlapping or partial

### Next.js

| Install slug                                       | Installs | Updated    | Notes                                                                                                                                                                                                     |
| -------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel/next.js@next-partial-prefetching-adoption` | 8.4K     | 2026-10-06 | Needs 16.3+. Good fit if `partialPrefetching` is turned on. Its optimizer skill has 1.7K installs                                                                                                         |
| `vercel/next.js@next-bundle-optimizer`             | 695      |            | Uses `pnpm exec next analyze`                                                                                                                                                                             |
| `vercel-labs/openreview@next-best-practices`       | 5.5K     | 2026-03-06 | Covers the middleware to proxy rename, async params, parallel and intercepting routes. Problems: written before 16.3, has a Tailwind section under fonts and a "when Edge runtime is appropriate" section |
| `vercel-labs/openreview@next-cache-components`     | 1.7K     | 2026-03-06 | Covered by the official vercel/next.js skills. Pre-16.3, so no `instant`                                                                                                                                  |
| `vercel-labs/openreview@next-upgrade`              | 1K       |            | Covered by the official vercel/next.js skills. Pre-16.3                                                                                                                                                   |
| `vercel-labs/agent-skills@next-best-practices`     | 74       |            | An old, nearly unused duplicate                                                                                                                                                                           |
| `affaan-m/ecc@nextjs-turbopack`                    | 9.8K     | 2026-09-18 | Next 16 plus Turbopack. Only the description was checked                                                                                                                                                  |

### React and design

| Install slug                                           | Installs | Updated    | Notes                                              |
| ------------------------------------------------------ | -------- | ---------- | -------------------------------------------------- |
| `vercel-labs/agent-skills@vercel-composition-patterns` | 392.7K   | 2026-01-28 | React 19 guidance: no forwardRef, `use()`. General |
| `anthropics/skills@frontend-design`                    | 986K     | 2026-09-03 | Visual direction. No Tailwind mentions found       |
| `pbakaus/impeccable@impeccable`                        | 331K     |            | Broad design review                                |

### Accessibility and performance

| Install slug                                     | Installs | Updated    | Notes                                                                                                                                        |
| ------------------------------------------------ | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel-labs/agent-skills@web-design-guidelines` | 735K     |            | Downloads `web-interface-guidelines/command.md` from GitHub on every run. Socket's security scan shows "Warn". Overlaps better-accessibility |
| `addyosmani/web-quality-skills@accessibility`    | 61K      | 2026-08-24 |                                                                                                                                              |
| `addyosmani/web-quality-skills@performance`      | 39.4K    | 2026-08-24 |                                                                                                                                              |
| `cloudflare/skills@web-perf`                     | 99K      | 2026-09-05 | Core Web Vitals and Lighthouse                                                                                                               |

### Motion

| Install slug                                | Installs | Updated    | Notes                                                      |
| ------------------------------------------- | -------- | ---------- | ---------------------------------------------------------- |
| `emilkowalski/skills@animation-performance` | 7.2K     | 2026-10-11 |                                                            |
| `emilkowalski/skills@improve-animations`    |          |            | Mentions Tailwind only as one place to look                |
| `kylezantos/design-motion-principles`       | 11.7K    |            | Reduced motion mandatory. Audit mode writes an HTML report |

### 3D

| Install slug                                       | Installs        | Updated    | Notes                                                                                      |
| -------------------------------------------------- | --------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `emalorenzo/three-agent-skills@r3f-best-practices` | 1.4K            | 2026-01-28 | Assumes zustand and leva. Its `perf-memo-components` rule is redundant with React Compiler |
| `cloudai-x/threejs-skills@threejs-*`               | 11K to 18K each |            | Plain three.js, not R3F                                                                    |

### Graphics, audio and OG images

| Install slug                                            | Installs | Updated    | Notes                                                   |
| ------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------- |
| `supermemoryai/skills@svg-animations`                   | 2.4K     | 2026-03-19 | SMIL and CSS SVG animation with reduced-motion handling |
| `dannyjpwilliams/ui-sound-design-skill@ui-sound-design` | 315      | 2026-04-08 | Web Audio, with Tone.js as an option to ignore          |
| `andrelandgraf/fullstackrecipes@og-image-generation`    | 233      |            | Very thin. It just curls a remote recipe                |

### Tooling and testing

| Install slug                                     | Installs | Updated    | Notes                                      |
| ------------------------------------------------ | -------- | ---------- | ------------------------------------------ |
| `antfu/skills@pnpm`                              | 21.9K    |            | Written for pnpm 11 and 12                 |
| `vercel/turborepo@turborepo`                     | 81.2K    |            | Only if Turborepo                          |
| `microsoft/playwright-cli@playwright-cli`        | 183.8K   |            | For driving a browser, not writing tests   |
| `tanstack-skills/tanstack-skills@tanstack-query` | 9.5K     | 2026-01-25 | v5 reference. An example uses `Date.now()` |

### Other

| Install slug                                            | Installs | Updated | Notes                                             |
| ------------------------------------------------------- | -------- | ------- | ------------------------------------------------- |
| `vercel-labs/agent-skills@deploy-to-vercel`             | 154.9K   |         |                                                   |
| `vercel-labs/agent-skills@vercel-optimize`              | 97.8K    |         |                                                   |
| `gamedev-skills/awesome-gamedev-agent-skills@game-feel` | 6.7K     |         | Engine-neutral game "juice"                       |
| `oxc-project/oxc@migrate-oxlint`                        | 7.5K     |         | Only for moving from ESLint to oxlint. Not needed |

## Avoid

These clash with the stack.

| Install slug                                                                                                                                                                                                                                                                                  | Installs | Why to avoid                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `patricio0312rev/skills@framer-motion-animator`                                                                                                                                                                                                                                               | 10.8K    | Runs `npm install framer-motion` and imports from `'framer-motion'`, not `motion/react`. Other "framer-motion" skills by mindrally, c-jeril and dylantarre likely share the problem. Not checked |
| `anthropics/skills@webapp-testing`                                                                                                                                                                                                                                                            | 177K     | Last updated 2025-12-01. Writes Python Playwright scripts                                                                                                                                        |
| `wshobson/agents@nextjs-app-router-patterns`                                                                                                                                                                                                                                                  | 31.9K    | "Next.js 14+". ISR-style fetch revalidate, no `'use cache'`, no proxy.ts                                                                                                                         |
| `addyosmani/agent-skills@frontend-ui-engineering`                                                                                                                                                                                                                                             | 57.2K    | Tailwind examples                                                                                                                                                                                |
| `rivet-dev/skills@multiplayer-game`                                                                                                                                                                                                                                                           | 7.2K     | Built around RivetKit actors. Our backend is NestJS                                                                                                                                              |
| `martinholovsky/claude-skills-generator@web-audio-api`                                                                                                                                                                                                                                        |          | Written "for JARVIS audio". Stale, 2025-11                                                                                                                                                       |
| Tailwind or shadcn skills: `wshobson/agents@tailwind-design-system`, `giuseppe-trisciuoglio/developer-kit@shadcn-ui`, `giuseppe-trisciuoglio/developer-kit@tailwind-css-patterns`, `heygen-com/hyperframes@tailwind`, `spencerpauly/awesome-cursor-skills@converting-css-modules-to-tailwind` |          | Excluded by name. Contents not checked                                                                                                                                                           |
| `cloudflare/skills@nextjs-on-cloudflare`                                                                                                                                                                                                                                                      |          | Wrong deploy target                                                                                                                                                                              |

## Gaps with no good skill

No skill on skills.sh covers these well:

- CSS Modules and design tokens.
- Canvas 2D.
- next/og `ImageResponse`.
- oxfmt.
- @northguild/gmt.
- Turn-based web multiplayer.

These get project skills of our own under `.agents/skills/` as the stories that need them land.

## Pages that did not load

- skills.sh/search returned an empty table, because results load with JavaScript. `npx skills find` was used instead.
- Individual skill pages cut off at "Show more" and show only "First seen".
- Repo pages show names and install counts only.
- For `deckardger/tanstack-agent-skills` and `rivet-dev/skills` the skill folder was not found, so their dates are for the whole repo.
