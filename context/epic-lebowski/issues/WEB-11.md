# WEB-11: Rendering strategies guide and the /lab page

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: WEB-5, WEB-6.

**Scope:** `context/epic-lebowski/rendering-strategies.md` gains a Routes table that maps every route to its rendering strategy, the Next or React API it teaches and why it fits. `/lab`, the Rendering lab, lists the same rows for admins only, grouped by strategy, with a link to each built page.

## Gap

Craig is building this app to learn every rendering strategy Next 16 offers. `rendering-strategies.md` explains each strategy, but it names routes only in free prose, so nobody can see at a glance which strategy a route uses, or which strategies no built page uses yet. The Definition of Done requires every story to record its strategy, so the record must be easy to check.

## Scope

**`context/epic-lebowski/rendering-strategies.md`**: the strategy table stays as the lesson. A new `## Routes` table below it has one row per route and strategy, so a route appears under each strategy it teaches.

| Column   | Holds                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| Route    | A URL path, such as `/feed` or `/api/auth/refresh`, or a file under `apps/web`, such as `proxy.ts` |
| Strategy | The strategy's name, exactly as the strategy table's first column has it                           |
| APIs     | `'use cache'`, `cacheLife`, `cacheTag`, `connection()`, ...                                        |
| Why      | One sentence on why this route fits this strategy                                                  |
| Story    | The story id that builds it                                                                        |
| Status   | Planned or Built                                                                                   |

Seed it with every route the strategy table names, the AUTH-7, AUTH-8 and AUTH-9 routes, and `/lab` itself. Fix the stale facts: `/` is `◐` since WEB-6, not `○`, and the five APIs marked "confirm when building" (`ensureStatic`, `use(browser())`, `catchError`, `refresh()`, `instant()`) are confirmed in the Next 16.4 docs. `browser` is imported from `react-dom`.

**`apps/web/src/content/lab.ts`**: two typed arrays.

- `labStrategies`: `{ name, meaning }[]`, one per row of the strategy table.
- `labRoutes`: `{ route, strategy, apis, why, story, status, href? }[]`. `strategy` must be one of the names. `status` is `"built"` or `"planned"`. `href` is set only on a built page a visitor can open.

**`apps/web/src/lib/session.ts`** gains `requireAdmin(next)`. It calls `getMe()`. No session redirects to `/login?next=<next>`. A role other than `admin` calls `forbidden()`. `apps/web/next.config.ts` turns on `experimental.authInterrupts: true`. FEED-19 reuses both.

**`apps/web/src/app/forbidden.tsx`**: "There are rules, and this room is one of them." with a link to `/feed`.

**`apps/web/src/app/(app)/lab/page.tsx`**: the Rendering lab, for admins only. The `<h1>` is in the static shell. One `<Suspense>` hole awaits `requireAdmin("/lab")`, then renders one `<h2>` per strategy with its meaning and its rows. A row with an `href` links to it. A planned row shows "Planned" and its story id.

**`apps/api/test/e2e-set-role.ts`** and `pnpm --filter @dudesphere/api e2e:set-role`: set the role of one `e2e-` user on the local databases, so the web e2e suite can sign in as an admin. No route can make an admin, on purpose.

## Design notes

- **Two copies, one owner.** The markdown file is the study note. `lab.ts` is what the page renders. Each story updates both in the same PR. A Vitest spec reads both and fails if they differ.
- **Admin only.** The rows must never reach a non-admin. Anything in the static shell goes to every visitor, so every row renders inside the role-checked hole, and `lab.ts` is imported only by Server Components. Nest is still the guard for data. Here the role from `getMe()` decides what HTML is sent.
- **`/lab` is itself a lesson row:** streaming behind a role check, the Data Access Layer, and `forbidden()`.
- **No `ensureStatic`.** `'navigation'` fails under the root layout, whose theme toggle reads a cookie. `'shell'` and `'prefetch'` add no build check.
- **No footer link.** An admin-only link would cost a call to Nest on every page render. FEED-19's admin nav links to `/lab`.
- **Name the APIs exactly.** Each row names the import, such as `import { cacheLife } from "next/cache"`, so a reader can search the code for it.

## Rendering strategy

`/lab` is a static shell with one streamed hole. The heading is prerendered. `LabIndex` reads the session through `requireAdmin()` inside `<Suspense>`, so `next build` lists `/lab` as `◐`. A signed-out visitor gets a redirect. A member gets the forbidden page with status 200 and a `noindex` tag, because `requireAdmin()` runs after streaming starts. No row is sent to either.

## Verification

- A signed-out visit to `/lab` redirects to `/login?next=%2Flab`.
- A signed-in member gets the forbidden page with status 200 and a `noindex` robots tag. The HTML and the RSC payload hold no row text.
- An admin sees every strategy group from `lab.ts`, with links only on built pages.
- The Vitest spec fails when a route is added to `lab.ts` but not to the markdown file, and the reverse. It also fails when a status, story or strategy name differs, when a strategy has no row, and when a planned row has an `href`.
- `next build` lists `/lab` as `◐`. No client chunk holds a row's text.
- `e2e:set-role` refuses a non-`e2e-` email, an unknown role and a database not on this machine.
- Each heading level is in order. The page works with the keyboard alone.

## Done when

- [ ] `rendering-strategies.md` has the Routes table, every planned and built row, and no stale "confirm when building" marks
- [ ] `apps/web/src/content/lab.ts` and the admin-only `/lab` page
- [ ] Vitest spec that keeps the two copies equal
- [ ] `requireAdmin()`, `authInterrupts` and `app/forbidden.tsx`, ready for FEED-19
- [ ] `e2e:set-role` and a Playwright spec for signed-out, member and admin visits
