# WEB-11: Rendering strategies guide and the /lab page

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 0. Blocked by: WEB-5, WEB-6.

**Scope:** `context/epic-lebowski/rendering-strategies.md` maps every route to its rendering strategy, the Next or React API it teaches and why it fits, and `/lab` lists the same rows with a link to each page.

## Gap

Craig is building this app to learn every rendering strategy Next 16 offers. Without one table, the lesson is scattered across 30 specs and the code, and nobody can see which strategy a page uses or which strategies no page uses yet. The Definition of Done requires every story to record its strategy, so the file must exist first.

## Scope

**`context/epic-lebowski/rendering-strategies.md`**: one table, one row per route or handler.

| Column   | Holds                                                       |
| -------- | ----------------------------------------------------------- |
| Route    | The URL or file, such as `/feed` or `api/lanes/ticker`      |
| Strategy | Static, cached in a PPR shell, dynamic streaming, and so on |
| APIs     | `'use cache'`, `cacheLife`, `cacheTag`, `connection()`, ... |
| Why      | One sentence on why this page fits this strategy            |
| Story    | The story id that built it                                  |
| Status   | Planned or Built                                            |

Seed it with every planned row from plan Part C.5:

- Full static with `generateStaticParams` and `ensureStatic`: `/laws`, `/rules`.
- `'use cache'` with `cacheLife` and `cacheTag` in a PPR shell: `/` (splash), `/stranger`.
- Dynamic streaming with `loading.tsx` and Suspense around `cookies()`: `/feed`, `/dudes/[id]`, `/dudes/me`.
- Cache invalidation three ways, `revalidateTag(tag, 'max')`, `updateTag` and `refresh()`: thread and compose.
- Server Actions with `useActionState` and `useOptimistic`: every form, compose.
- Route Handlers: the BFF (`api/auth/*`, `api/bff/*`), SSE streaming (`api/lanes/ticker`), `ImageResponse` (OG image, certificate).
- `proxy.ts`.
- `after()`: check-in streaks, admin audit line.
- `connection()`: runtime env in self-hosted builds.
- Parallel and intercepting routes with `<Activity>`: the thread modal.
- View Transitions with `transitionTypes` and React's `<ViewTransition>`: page swaps, the avatar shared element.
- `use(browser())`: Web Audio on the lane, later the 3D canvas.
- `forbidden()` behind `experimental.authInterrupts`: admin.
- `catchError` boundaries, `not-found.tsx`.
- Partial Prefetching and the `instant()` Playwright helper.
- React Compiler on everywhere.
- A "Not used" section naming the Edge runtime and `middleware.ts` as deprecated, with the reason.

**`apps/web/src/app/lab/page.tsx`**: renders the same rows from `apps/web/src/content/lab.ts`, a typed array `{ route, strategy, apis, why, story, built }[]`. A row whose page is built links to it; a planned row shows "Planned" with no link. Grouped by strategy, with a heading per group.

## Design notes

- **Two copies, one owner.** The markdown file is the study note. `lab.ts` is what the page renders. Each story updates both in the same PR. A Vitest spec reads both and fails if their route lists differ.
- **The `/lab` page is itself a lesson row.** It is fully static: content from a module, no request data.
- **Name the APIs exactly.** Each row names the import, such as `import { cacheLife } from "next/cache"`, so a reader can search the code for it.
- **Confirm each API in the Next 16.4 docs before its story builds it.** Several are new (`refresh()`, `catchError`, `ensureStatic`, `instant()`, `use(browser())`). If a name changed, fix the row and the plan.

## Rendering strategy

`/lab` is fully static. `next build` reports it as static, and it is the reference row for "no request data at all".

## Verification

- `/lab` renders every row from `lab.ts`, grouped, with links only on built rows.
- The Vitest spec fails when a route is added to `lab.ts` but not to the markdown file, and the reverse.
- `next build` marks `/lab` static.
- Each heading level is in order; the page works with the keyboard alone.

## Done when

- [ ] `rendering-strategies.md` with every planned row and the "Not used" section
- [ ] `apps/web/src/content/lab.ts` and `/lab` page
- [ ] Vitest spec that keeps the two lists equal
- [ ] `/lab` linked from the site footer
