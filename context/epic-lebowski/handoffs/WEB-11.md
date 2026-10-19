# WEB-11: Rendering strategies guide and the /lab page

- **Issue:** #45
- **Spec:** [issues/WEB-11.md](../issues/WEB-11.md)
- **Branch:** `45-web-11-rendering-strategies-guide-and-the-lab`. Matches `feature/<id>-<slug>`: no (made by `worktree branch --github`)
- **Blocked by:** none. WEB-5 and WEB-6 are ✅ Done
- **Status:** Done

## Scope

An admin can open `/lab`, the Rendering lab, and see every rendering strategy the app teaches. Each strategy has a heading, a one-line meaning and its routes. A built page links to the live route, and a planned one shows its story id. Signed-out visitors are sent to sign in, and members get the forbidden page (status 200 with `noindex`, see Decisions). `rendering-strategies.md` gains a Routes table with the same rows, and a Vitest test keeps the two copies equal.

## Decisions

- Markdown shape: keep the strategy table as the lesson, and add a `## Routes` table below it with the columns Route, Strategy, APIs, Why, Story and Status.
- Row unit: one row per route and strategy. A route such as `/login` appears under each strategy it teaches, so every strategy gets a group on `/lab`, including `after()`, `connection()` and the React Compiler.
- Route column: a URL path for a page or handler, such as `/feed` or `/api/auth/refresh`. When a strategy has no route of its own, it holds a file path under `apps/web`, such as `proxy.ts`, `lib/session.ts` or `next.config.ts` (widened from `apps/web/src` by Craig in review round 1, QA-1).
- ABIDE-30's Cache invalidation row follows its spec: `revalidateTag("checkins:" + userId, "max")` inside `after()`, not `refresh()` (Craig, review round 1, QA-2).
- `lab.ts` exports the strategies too: each name exactly as the strategy table's first column, with a one-line meaning. The test fails if the names differ, or if a strategy has no row.
- The test compares route, strategy, story and status between the two copies, in both directions.
- Links: each row has an optional `href`, set only on a built page a visitor can open. Handlers, files and planned rows get none. A planned row with an `href` fails the test.
- Admin only (Craig, during planning): `/lab` is for admins. WEB-11 builds `requireAdmin(next)` as FEED-19 planned it. No session sends the visitor to `/login?next=/lab`. A role other than `admin` calls `forbidden()`. The role comes from `getMe()`, never from the token.
- `experimental.authInterrupts: true` goes on in this story, and a root `app/forbidden.tsx` says "There are rules, and this room is one of them.", with a link to `/feed`. FEED-19 reuses all three.
- Rendering: the page is synchronous, and its `<h1>` is in the static shell. Every row renders inside one `<Suspense>` hole, `LabIndex`, which awaits `requireAdmin("/lab")` first. Nothing from `lab.ts` may be in the static shell, because the shell goes to every visitor. The rows need JavaScript, as any Suspense hole does. `next build` lists `/lab` as `◐`.
- Member status (Craig, 2026-10-19, during build): a member gets status 200, not 403. `requireAdmin("/lab")` runs inside the `<Suspense>` hole, after streaming starts, so `forbidden()` renders `forbidden.tsx` in place of the page's content (the shell's heading and intro go too) and Next adds `<meta name="robots" content="noindex">`. The installed `forbidden.md` says so ("keeps its `200` status"). Tests check the forbidden copy, the noindex tag and that no row text is sent, never a 403. Signed out, `redirect()` also runs after streaming starts, so the browser still lands on `/login?next=%2Flab`, but not through an HTTP 307.
- No `ensureStatic` export. `'navigation'` fails under the root layout's theme hole, and `'shell'` and `'prefetch'` add no build check.
- No footer link. An admin-only footer link would cost a `getMe()` call to Nest on every page render for every signed-in member. FEED-19's admin nav adds a "Rendering lab" link.
- Title and copy: "Rendering lab". `/lab` shows the strategy groups only. The "Deprecated, not used" table stays in the markdown.
- Location: `apps/web/src/app/(app)/lab/page.tsx`, next to `/feed`. The URL is `/lab`.
- Admin in e2e: a new API script, `e2e:set-role`, sets the role of one `e2e-` user. The web Playwright suite calls it the way it calls `e2e:cleanup`.
- Stale facts in `rendering-strategies.md` are fixed here. See Gaps.
- Workflow docs name `lab.ts` next to the markdown, so later stories update both.

## Gaps

| Gap                                                                                                     | How it was settled                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rendering-strategies.md` exists, grouped by strategy. The spec asks for one row per route              | Task 3 adds a Routes table. The strategy table stays                                                                                                                                                                          |
| The spec's `/lab` was public and fully static. Craig wants it for admins only                           | Tasks 2 and 4: `requireAdmin()`, `forbidden()`, rows inside the gated hole                                                                                                                                                    |
| `/lab` could never be fully static: the root layout's theme toggle reads a cookie, so every page is `◐` | Moot now that `/lab` streams behind the role check                                                                                                                                                                            |
| The spec put a `/lab` link in the site footer                                                           | Dropped. FEED-19's admin nav links to it. FEED-19's spec edited                                                                                                                                                               |
| FEED-19 planned `requireAdmin()`, `authInterrupts` and `(app)/admin/forbidden.tsx`                      | Built here, with `forbidden.tsx` at the app root. FEED-19's spec edited to reuse them                                                                                                                                         |
| No route can make an admin, by design, so the web e2e suite can't sign in as one                        | Task 1: `e2e:set-role`, limited to `e2e-` users on local databases                                                                                                                                                            |
| Baseline row says `/` is `○ (Static)`. Since WEB-6 it is `◐`                                            | Task 3 fixes the row                                                                                                                                                                                                          |
| "Confirm when building" on `ensureStatic`, `use(browser())`, `catchError`, `refresh()` and `instant()`  | Task 3. The installed Next 16.4 docs confirm all five. `browser` is imported from `react-dom`. `ensureStatic` takes `'auto'`, `'shell'`, `'prefetch'`, `'navigation'` or `false`, and only `'navigation'` is checked at build |
| AUTH-8 and AUTH-9 could not add their routes to `/lab` (it did not exist)                               | Task 3 adds them, and removes the note from "How to record a new use"                                                                                                                                                         |
| The Definition of Done, the "How to record" steps and the agent checklists name only the markdown       | Task 5, and the tracker's Definition of Done line edited at planning                                                                                                                                                          |
| API-10 leftover: `getMe()` turns Nest's 429 into the generic error page                                 | Moved to AUTH-52's spec and issue #46. `/lab` inherits it through `requireAdmin()` until then                                                                                                                                 |
| API-10 leftovers otherwise                                                                              | None open. Its nits were fixed in its PR                                                                                                                                                                                      |

## Tasks

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                  | Files                                                                                                                                                                                                                                                                          | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Depends on | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| 1   | `e2e:set-role`. `setE2eRole(email, role)` updates one user's `role` in Postgres. It refuses an email that isn't `e2e-<12 hex>@example.com`, a role that isn't in `UserRole`, and a database not on this machine (reuse `assertLocalDatabases` from `test/local-databases.ts`). It fails when no user matches. The CLI takes `--email` and `--role`, like `e2e-cleanup-cli.ts`, and exits 1 on any failure. Add `"e2e:set-role"` to `apps/api/package.json`. Note the script in `context/fullstack-architecture.md` where the e2e scripts are listed                                                                                                                                                                                                                                                                                                                       | fullstack-hooker-upper | `apps/api/test/e2e-set-role.ts`, `apps/api/test/e2e-set-role-cli.ts`, a unit spec beside them, `apps/api/package.json`, `context/fullstack-architecture.md`                                                                                                                    | Unit: refuses a non-e2e email, an unknown role, a remote host; fails on no match; sets the role on a match                                                                                                                                                                                                                                                                                                                                                                      | -          | Done   |
| 2   | `requireAdmin(next)` in `lib/session.ts`. It calls `getMe()`. `null` redirects to `/login?next=<next>`, the same way `requireSession` does. A role other than `admin` calls `forbidden()` from `next/navigation`. It returns the `UserResponse`. Turn on `experimental.authInterrupts: true` in `next.config.ts`, with a one-line comment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | fullstack-hooker-upper | `apps/web/src/lib/session.ts`, `apps/web/src/lib/session.spec.ts`, `apps/web/next.config.ts`, `apps/web/src/next-config.spec.ts`                                                                                                                                               | Vitest: no session redirects with `next` encoded; a `user` calls `forbidden()`; an `admin` returns the member; a non-401 error is thrown. The config spec sees `authInterrupts`                                                                                                                                                                                                                                                                                                 | -          | Done   |
| 3   | The two copies and the test. `lab.ts` exports `labStrategies` (`{ name, meaning }[]`) and `labRoutes` (`{ route, strategy, apis, why, story, status: "built" \| "planned", href? }[]`), typed so `strategy` must be one of the names. In `rendering-strategies.md`: add `## Routes` with every route from the strategy table's "Where" cells, the AUTH-7, AUTH-8 and AUTH-9 routes, and `/lab` itself (Streaming dynamic, Data Access Layer, `forbidden()` rows, WEB-11, Built). Fix the stale facts in Gaps. Move `forbidden()` to WEB-11 for `/lab`, with FEED-19 for the admin pages. Rewrite "The `/lab` page" for the admin gate, and "How to record a new use" so step 3 says to add the row to the Routes table and to `lab.ts`. `lab.spec.ts` reads the markdown with `readFileSync`, parses the strategy table's first column and the Routes table, and compares | fe-tdd-dev             | `apps/web/src/content/lab.ts`, `apps/web/src/content/lab.spec.ts`, `context/epic-lebowski/rendering-strategies.md`                                                                                                                                                             | Vitest: route, strategy, story and status match in both directions; strategy names match; every strategy has a row; a planned row has no `href`; each `href` starts with `/` and not `/api`. Prove each check goes red by editing one copy, then put it back                                                                                                                                                                                                                    | -          | Done   |
| 4   | The page. `app/(app)/lab/page.tsx` is synchronous, exports `metadata` with the title "Rendering lab" and `robots: { index: false }`, and renders the `<h1>` and an intro line in the shell. `<Suspense>` wraps `LabIndex`, an async Server Component (no `'use client'`) that awaits `requireAdmin("/lab")`, then renders one `<h2>` per strategy with its meaning and its rows. Each row shows the route (a link when `href` is set), APIs, why, story and status. `app/forbidden.tsx` says "There are rules, and this room is one of them." with a link to `/feed`. Use the `ui/` parts. Fix the 403 wording for `/lab` in `rendering-strategies.md` and `lab.ts` (the `forbidden()` strategy meaning, the `/lab` `forbidden()` row's Why, and "The `/lab` page"): inside `<Suspense>` the status stays 200                                                             | fe-tdd-dev             | `apps/web/src/app/(app)/lab/page.tsx` and spec, `apps/web/src/components/LabIndex/LabIndex.tsx`, `.module.css` and spec, `apps/web/src/app/forbidden.tsx` and spec, `apps/web/e2e/lab.spec.ts`, `apps/web/src/content/lab.ts`, `context/epic-lebowski/rendering-strategies.md` | Vitest: every group and row from `lab.ts`, links only where `href` is set, heading order h1 then h2, `requireAdmin("/lab")` called before any row renders. Playwright: signed out goes to `/login?next=%2Flab`; an `e2e-` member gets the forbidden copy and a `noindex` robots tag (status stays 200, see Decisions), and the response body holds no row text; an `e2e-` admin (via `e2e:set-role`) sees every group, can tab to each link, and axe is clean in light and dark | 1, 2, 3    | Done   |
| 5   | Workflow docs. Name `apps/web/src/content/lab.ts` next to `rendering-strategies.md` in: `.agents/fe-tdd-dev.md` (description, the read list and step 8), `.agents/qa-skeptic.md`, `.agents/pr-finalizer.md`, `.agents/mentor.md`, and `.agents/skills/plan-story/SKILL.md`. In `context/frontend-architecture.md`, update the source tree line for `lab/page.tsx` (now under `(app)`, admin only) and add `content/lab.ts`. In `context/epic-lebowski/issues/WEB-11.md`, change the Rendering strategy and Verification lines that promise a member a 403: the member gets the forbidden page with status 200 and noindex                                                                                                                                                                                                                                                 | fe-tdd-dev             | the seven files named                                                                                                                                                                                                                                                          | `pnpm format:check`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 3          | Done   |

Owners: `fullstack-hooker-upper`, `fe-tdd-dev`, `3d-animator`.

Tasks 1, 2 and 3 share no files and can run at the same time.

## Reviewers

qa-skeptic, owasp-hacker and a11y-expert run on every story. Areas to look at
hard on this one:

- qa-skeptic: the parity test really fails when only one copy changes, in each direction and for each compared field. Every strategy in the table has a group on `/lab`. `next build` lists `/lab` as `◐`. Rows marked Built point at routes that exist.
- owasp-hacker: no row text reaches a non-admin, in the static shell, the RSC payload (`?_rsc=`), a prefetch, or any `.next/static` chunk. `lab.ts` must only be imported by Server Components. The role comes from Nest through `getMe()`, never from the token. The `next` redirect stays on the site. `e2e:set-role` refuses a remote database and a non-`e2e-` user.
- a11y-expert: heading order (h1, then h2 per strategy, nothing skipped), link names that say the route, the Suspense fallback, the 403 page, keyboard-only use, contrast in light and dark. No motion is added.

## Verification

- A signed-out visit to `/lab` redirects to `/login?next=%2Flab`.
- A signed-in member gets the forbidden page, with status 200 and a `noindex` tag, because `forbidden()` runs after streaming starts. The HTML and the RSC payload hold no row text.
- An admin sees one `<h2>` per strategy in the strategy table, each with its meaning and its rows. Built page rows link to their route. Planned rows, handlers and files have no link.
- The Vitest spec fails when a route is added to `lab.ts` but not to the markdown, and the reverse. It also fails when a status, story or strategy name differs, when a strategy has no row, and when a planned row has an `href`.
- `next build` lists `/lab` as `◐`. No `.next/static` file holds a row's text.
- `e2e:set-role` refuses a non-`e2e-` email, an unknown role and a database not on this machine.
- Heading levels are in order. The page works with the keyboard alone. axe finds nothing in light or dark.
- `pnpm e2e:check` passes after the e2e runs and review rounds.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm build` pass.

## Open questions

None.

## PR

**Title:** WEB-11 (#45): Rendering strategies guide and the /lab page

**Body:**

An admin can now open `/lab`, the Rendering lab, and see every rendering strategy the app teaches, with the routes that use each one. A signed-out visitor is sent to sign in. A member who is not an admin gets the "Off limits" page.

## What changed

**API (`apps/api`)**

- New script `pnpm --filter @dudesphere/api e2e:set-role --email <email> --role <role>`. No route can make an admin, so the web end-to-end suite uses this script to sign in as one. It refuses an email that is not `e2e-<12 hex>@example.com`, a role that is not in `UserRole`, a repeated flag, and a database that is not on this machine. It exits 1 when no user matches.

**Web (`apps/web`)**

- `requireAdmin(next)` in `lib/session.ts`. It reads the role from Nest through `getMe()`, never from the token. No session redirects to `/login?next=<next>`. Any role other than `admin` calls `forbidden()`.
- `experimental.authInterrupts` is on, and a root `app/forbidden.tsx` shows "Off limits" and "There are rules, and this room is one of them."
- `/lab` page at `app/(app)/lab/page.tsx`, with the `LabIndex` component. The heading is in the static shell. The rows sit in one `<Suspense>` hole behind `requireAdmin("/lab")`, so no row text goes to anyone else.
- `src/content/lab.ts` holds the strategies and routes. `rendering-strategies.md` gains a `## Routes` table with the same rows, and a Vitest spec fails when the two copies differ in route, strategy, story or status, when a strategy has no row, or when a planned row has a link.

**Docs**

- The agent instructions and `context/frontend-architecture.md` name `lab.ts` next to the guide, so later stories update both.
- FEED-19 now reuses `requireAdmin()`, `authInterrupts` and the forbidden page, and is no longer blocked by WEB-11. AUTH-52 takes API-10's 429 leftover.
- The tracker marks WEB-11 done.

## Rendering strategy

Streaming dynamic, with a Data Access Layer gate and `forbidden()`. `next build` lists `/lab` as `◐`. A member gets status 200 with a `noindex` tag, not 403, because `forbidden()` runs inside `<Suspense>` after streaming has started. Craig chose this on 2026-10-19 to keep the static shell. The same applies to FEED-19's admin pages.

## What it teaches

- Rendering ([rendering-lesson.md](https://github.com/craig-o-curtis/dudesphere/blob/45-web-11-rendering-strategies-guide-and-the-lab/lessons/rendering-lesson.md#web-11-rendering-strategies-guide-and-the-lab-page)): the static shell goes to every visitor, so anything only some visitors may see must sit in a `<Suspense>` hole behind its check, in the same component that renders it. After the shell has gone, `forbidden()` can no longer change the status.
- Authorization ([auth-lesson.md](https://github.com/craig-o-curtis/dudesphere/blob/45-web-11-rendering-strategies-guide-and-the-lab/lessons/auth-lesson.md#web-11-rendering-strategies-guide-and-the-lab-page)): `requireAdmin()` asks Nest for the role on every render instead of reading it from the token, so a demoted admin loses access at once.

## Checks

- `pnpm lint`: 0 errors, 0 warnings
- `pnpm format:check`: passes
- `pnpm typecheck`: passes
- `pnpm test`: API 1226 passed, web 1609 passed
- `pnpm build`: passes, `/lab` is `◐`
- `pnpm test:e2e` (API): 371 passed
- Web end-to-end: 118 passed
- `migration:check`: no changes
- `pnpm e2e:check`: clean

## Review

Four rounds with qa-skeptic, owasp-hacker and a11y-expert. All three pass in round 4.

Nits and minor findings fixed in this PR:

- Round 1: QA-1 to QA-9 and A11Y-1, A11Y-2. Route cells outside `src`, the ABIDE-30 row, the forbidden page had no heading.
- Round 2: QA-10 to QA-18 and A11Y-3. Parity-test gaps, WEB-47 and FEED-16 rows, the repeated `--role` flag.
- Round 3: A11Y-4 (a long route name scrolled sideways at 320 px) and QA-19.
- Round 4: QA-20 and MEN-1, a wait on row text and a test name.

Nits moved to later stories: none.

Closes #45

## Log

- 2026-10-19: Planned. Four grilling rounds. Craig made `/lab` admin only, so WEB-11 now builds `requireAdmin()`, `authInterrupts` and the root `forbidden.tsx` that FEED-19 had planned.
- 2026-10-19: Tracker: API-10 set to ✅ Done (PR #95 merged, issue #44 closed) and WEB-11 to ⏳ In progress, at Craig's request.
- 2026-10-19: With Craig's yes: `issues/WEB-11.md` rewritten for the Routes table, the admin gate and `e2e:set-role`, and mirrored to #45. The `auth-lesson` label added to #45.
- 2026-10-19: With Craig's yes: `issues/FEED-19.md` now reuses WEB-11's `requireAdmin()`, `authInterrupts` and root `forbidden.tsx`, and its admin nav links to `/lab`. Mirrored to #54. Its Blocked by gains WEB-11, in the spec and the tracker row. #54 had drifted: it still named AUTH-8 as a blocker, and the mirror fixed that.
- 2026-10-19: With Craig's yes: API-10's 429 leftover added to `issues/AUTH-52.md` (a Scope line, a Verification line and a Done-when line), and mirrored to #46. #46 had the same AUTH-8 drift, also fixed.
- 2026-10-19: With Craig's yes: the tracker's Definition of Done line names the Routes table, `lab.ts` and the Vitest spec.
- 2026-10-19: `/implement` started. Status set to Building.
- 2026-10-19: Task 1 started (fullstack-hooker-upper).
- 2026-10-19: Task 2 started (fullstack-hooker-upper).
- 2026-10-19: Task 3 started (fe-tdd-dev).
- 2026-10-19: Task 1 done. `e2e-set-role.spec.ts` 20 passed; API unit suite 1221 passed. A real role change on a signed-up user is first exercised by task 4's Playwright run.
- 2026-10-19: Task 2 done. `session.spec.ts` and `next-config.spec.ts` 138 passed; web suite 1593 passed. The builder found that the installed `forbidden.md` says a `forbidden()` inside `<Suspense>`, after streaming starts, keeps status 200. The plan expects 403 for members. Put to Craig.
- 2026-10-19: Craig chose to accept status 200 for members (forbidden page plus noindex), keeping the static shell. Decisions, Verification and tasks 4 and 5 updated. Task 4 now also fixes the 403 wording in `rendering-strategies.md` and `lab.ts`; task 5 fixes it in `issues/WEB-11.md`.
- 2026-10-19: Leftover for pr-finalizer: `issues/FEED-19.md` (lines 44 and 49) and #54 promise a 403 from `forbidden()` inside Suspense. Same 200 status applies there.
- 2026-10-19: Task 3 done. `lab.spec.ts` 7 passed, each check proved red. 23 strategies, 63 rows, 8 with `href`. Planned route names `/laws/[step]`, `/laws/result`, `/abide`, `/world`, `/lanes`, `lib/env.ts` and `/certificate/[userId]/image` are guesses no spec names. Two rows use paths outside `src`: `next.config.ts` and `e2e/navigation.spec.ts`. `ensureStatic.md:123` confirms only `'navigation'` adds a build check.
- 2026-10-19: Task 4 started (fe-tdd-dev).
- 2026-10-19: Task 5 started (fe-tdd-dev).
- 2026-10-19: Task 5 done. Seven docs updated. `pnpm format:check` passes after the handoff was formatted. Known nit for review: the `content/lab.ts` line in `frontend-architecture.md` sits between `lib/` entries.
- 2026-10-19: Task 4 done. 19 Vitest tests passed across the page, `LabIndex`, `forbidden.tsx` and `lab.spec.ts`; web suite 1605 passed. Playwright `lab.spec.ts` 4 passed, the first real run of `e2e:set-role`. `next build` lists `/lab` as `◐`. No `.next/static` file holds row text. `pnpm e2e:check` clean. Open question for review: `forbidden.tsx` has no heading of its own.
- 2026-10-19: Status set to Reviewing. Round 1: build, serve on 3101, start qa-skeptic, owasp-hacker and a11y-expert.
- 2026-10-19: Round 1, a11y-expert: pass. Keyboard and reduced motion pass; axe clean for admin and member in light and dark. A11Y-1 (minor, fe-tdd-dev): `forbidden()` replaces the whole page segment, so a member's `/lab` has no heading; `forbidden.tsx` needs its own `h1`. A11Y-2 (nit): goes with A11Y-1.
- 2026-10-19: Round 1, owasp-hacker: pass, no findings. No row text in `.next/static`, the shell, RSC or prefetch responses for signed-out or member visits. Forged role tokens refused; demotion takes effect at once; `e2e:set-role` refused every injection and remote-host case.
- 2026-10-19: Round 1, qa-skeptic: fail. QA-1 major (Route cells outside `apps/web/src`); QA-2, QA-3, QA-6, QA-7 minor; QA-4, QA-5, QA-8, QA-9 nits. Checks: lint, typecheck, format, unit tests (api 1221, web 1605) and `migration:check` pass.
- 2026-10-19: Round 1 cleanup: `pnpm e2e:cleanup` removed 13 users, 13 profiles and 13 refresh tokens. `pnpm e2e:check` clean.
- 2026-10-19: Craig: QA-1, widen the Route rule to `apps/web`, and the WEB-46 row becomes `e2e/*.spec.ts`. QA-2, ABIDE-30 follows its spec (`revalidateTag` in `after()`).
- 2026-10-19: Handoff Scope line fixed for QA-6. Leftover for pr-finalizer: re-mirror #45 from `issues/WEB-11.md` (its body still promises a 403), along with the FEED-19 and #54 leftover.
- 2026-10-19: Fix round 1 started: fe-tdd-dev (QA-1, QA-2, QA-3 with A11Y-1 and A11Y-2, QA-5, QA-6, QA-7, QA-8, QA-9); fullstack-hooker-upper (QA-4).
- 2026-10-19: QA-4 fixed (fullstack-hooker-upper): `requireAdmin` JSDoc says "the forbidden page". `session.spec.ts` 134 passed.
- 2026-10-19: Fix round 1 done (fe-tdd-dev): QA-1, QA-2, QA-3 with A11Y-1 and A11Y-2, QA-5, QA-6, QA-7, QA-8, QA-9 fixed. WEB-45's row now uses `lib/api.ts` (the file that reads `API_URL`); FEED-16's View Transitions row uses `app/(app)/layout.tsx`. `forbidden.tsx` has an `h1` "Off limits". Specs 156 passed; lint, typecheck, format pass. Playwright `lab.spec.ts` 4 passed with the new `h1` check; its teardown removed 3 users.
- 2026-10-19: Rebuilt (through the Playwright run) and restarted 3101. Round 2 started: qa-skeptic, owasp-hacker, a11y-expert.
- 2026-10-19: Round 2, a11y-expert: pass. A11Y-1 and A11Y-2 fixed. A11Y-3 (nit): a member's forbidden page keeps the "Rendering lab" tab title, because the title goes out in the static shell before the role check.
- 2026-10-19: Round 2, owasp-hacker: pass, no findings. No row text for signed-out or member visits in any response or in `.next/static`; the `<noscript>` adds no script.
- 2026-10-19: Round 2, qa-skeptic: pass. QA-10 to QA-14 minor, QA-15 to QA-18 nits, plus an observation: `e2e:set-role` takes the last of two `--role` flags. Checks: lint, typecheck, format, unit tests (api 1221, web 1608), `migration:check` pass. 24 of 27 parity mutations went red; the 3 green ones are QA-14.
- 2026-10-19: Round 2 cleanup: `pnpm e2e:cleanup` removed 10 users, 10 profiles and 11 refresh tokens. `pnpm e2e:check` clean.
- 2026-10-19: Handoff Decisions fixed for QA-10. Defaults taken from the specs, no question to Craig: QA-11, the WEB-47 row says Partial Prefetching is already on since WEB-5 and WEB-47 verifies it with `instant()`; QA-12, FEED-16's View Transitions row uses `/abidings/[id]` (FEED-16.md:24-27 puts them on the card-to-thread move); QA-13, add a Streaming dynamic row for `components/SiteFooter/SiteFooter.tsx` (WEB-6, Built).
- 2026-10-19: Leftover for pr-finalizer: `issues/WEB-47.md` (lines 5, 17, 49) and its GitHub issue say WEB-47 turns Partial Prefetching on, but `next.config.ts` has had it since WEB-5.
- 2026-10-19: Fix round 2 started: fe-tdd-dev (QA-10 to QA-18, A11Y-3); fullstack-hooker-upper (`e2e:set-role` repeated flags).
- 2026-10-19: Set-role flags fixed (fullstack-hooker-upper): a repeated `--email` or `--role` exits 1 before any connection. New `e2e-set-role-cli.spec.ts`; `test/e2e-set-role` 25 passed.
- 2026-10-19: Fix round 2 done (fe-tdd-dev): QA-10 to QA-18 and A11Y-3 (a doc sentence, no code change) fixed. `lab.spec.ts` now ties each `href` to its route; the three QA-14 edits go red. Specs 23 passed; lint, typecheck, format pass. Playwright `lab.spec.ts` 4 passed; teardown removed 3 users.
- 2026-10-19: Rebuilt (through the Playwright run) and restarted 3101. Round 3 started: qa-skeptic, owasp-hacker, a11y-expert.
- 2026-10-19: Round 3, a11y-expert: fail. A11Y-4 (major, WCAG 1.4.10): `/lab` as an admin scrolls sideways at 320 px (333 px wide). The new `components/SiteFooter/SiteFooter.tsx` route is one long word, and `globals.css:58` sets `overflow-wrap: break-word` on descendants, overriding `.row { overflow-wrap: anywhere }`. Everything else passes, keyboard and reduced motion included.
- 2026-10-19: Round 3, owasp-hacker: pass, no findings. No row text for signed-out or member visits, new rows included; all 19 `href` values same-site; every `e2e:set-role` bypass attempt refused.
- 2026-10-19: Round 3, qa-skeptic: pass. All round 2 findings fixed; 33 of 33 parity mutations red. QA-19 (nit, fe-tdd-dev): two comments over 100 characters, and the `<noscript>` JSDoc wrongly says a member sees the forbidden page after it.
- 2026-10-19: Round 3 cleanup: `pnpm e2e:cleanup` removed 12 users, 12 profiles and 14 refresh tokens. `pnpm e2e:check` clean.
- 2026-10-19: Three rounds done with A11Y-4 (major) open. Craig: fix it and QA-19, then run round 4 with all three reviewers.
- 2026-10-19: Fix round 3 started: fe-tdd-dev (A11Y-4, QA-19).
- 2026-10-19: Fix round 3 done (fe-tdd-dev): A11Y-4 fixed in `LabIndex.module.css` (`.row, .row *` with `overflow-wrap: anywhere` and `min-width: 0`); a new 320 px check in `e2e/lab.spec.ts` failed at 333 px before the fix. QA-19 fixed. Specs 23 passed; format passes; Playwright `lab.spec.ts` 4 passed; teardown removed 3 users.
- 2026-10-19: Rebuilt (through the Playwright run) and restarted 3101. Round 4 started: qa-skeptic, owasp-hacker, a11y-expert.
- 2026-10-19: Round 4, a11y-expert: pass. A11Y-4 fixed: no sideways scroll at 320x700 or 320x256 (400% zoom), member and admin, light and dark; axe clean; keyboard and reduced motion pass.
- 2026-10-19: Craig asked for chunked commits as soon as possible and a PR when ready. Status set to Finalizing while round 4's qa-skeptic and owasp-hacker finish. pr-finalizer started in commit-only mode (no build or e2e while 3101 serves the reviewers). Issue #45 has `rendering-lesson` and `auth-lesson`: mentor started.
- 2026-10-19: Round 4, qa-skeptic: pass. QA-19 fixed; lint, typecheck, format and unit tests (api 1226, web 1609) pass; the 320 px check is not flaky. QA-20 (nit, fe-tdd-dev): the wait after the resize in `e2e/lab.spec.ts:143` is on the shell's `h1`, so it should wait on row text instead. Routed.
- 2026-10-19: Round 4, owasp-hacker: pass, no findings. All three reviewers pass round 4.
- 2026-10-19: Round 4 cleanup: `pnpm e2e:cleanup` removed 6 users, 6 profiles and 5 refresh tokens. `pnpm e2e:check` clean. Review server on 3101 stopped.
- 2026-10-19: QA-20 fixed (fe-tdd-dev): the 320 px block waits on row text. Lint, typecheck and format pass; pr-finalizer's e2e run checks it.
- 2026-10-19: pr-finalizer phase 1: lint, typecheck, format and unit tests (api 1226, web 1609) pass. Six commits: 901ae14, 1bd7301, 4034661, dfb5a91 (QA-20 included), 0c72112, 4959edc. No trailer lines. Not pushed. Handoff and lessons left for phase 2.
- 2026-10-19: Mentor done: one WEB-11 entry each in `lessons/rendering-lesson.md` and `lessons/auth-lesson.md`, checked against the installed Next 16.4 docs and ctx7. Mentor nit (MEN-1, fe-tdd-dev): the member test's `noindex` check in `e2e/lab.spec.ts` can't tell Next's tag from the page's own `robots: { index: false }`. Routed before phase 2.
- 2026-10-19: MEN-1 fixed (fe-tdd-dev): the member test says its noindex check proves /lab stays out of search, not that `forbidden()` ran. Playwright `lab.spec.ts` 4 passed; `e2e:check` clean. pr-finalizer phase 2 resumed.
- 2026-10-19: Round 4: all three reviewers pass. QA-20 and MEN-1 fixed. Mentor wrote both lessons; pr-finalizer checked them: one entry and one Contents line each, snippets match the code.
- 2026-10-19: Full checks: lint, format, typecheck pass; unit tests API 1226, web 1609; build passes with `/lab` as `◐`; API e2e 371; web e2e 118; `migration:check` clean; `e2e:check` clean.
- 2026-10-19: Leftovers fixed in local specs: `issues/FEED-19.md` (member gets status 200 and noindex, WEB-11 removed from Blocked by) and `issues/WEB-47.md` (Partial Prefetching is on since WEB-5; WEB-47 only verifies it). Waiting for Craig's yes to mirror them to #54, #45 and #82, then push and open the PR.
- 2026-10-19: With Craig's yes: #45, #54 and #82 mirrored from their specs (absolute links; read back, equal apart from a trailing newline). Pushed, and PR opened: https://github.com/craig-o-curtis/dudesphere/pull/96 (labels documentation, enhancement, epic-lebowski, fullstack, rendering-lesson, auth-lesson; milestone Phase 0: Foundation).
