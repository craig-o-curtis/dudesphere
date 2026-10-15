# Next.js standards

Rules for routes, rendering and caching in `apps/web`, on Next.js 16.4 with Cache Components on. Read this before you plan, build or review a route, a layout, a cached component or a modal.

Which story teaches which strategy is in `context/epic-lebowski/rendering-strategies.md`. Where code lives and how to place Suspense boundaries is in the nextjs-app-architecture skill.

## Rendering strategies

- CSR - Client-Side Rendering: use when the data changes as the user clicks, or belongs only to them, and search engines don't need it.
- SSR - Server-Side Rendering: use when each request needs fresh or per-user data, such as anything that reads the session cookie.
- ISR - Incremental Static Regeneration: use when a page is the same for everyone but its data changes now and then, so a cached copy can be rebuilt in the background.
- SSG - Static Site Generation: use when a page is the same for everyone and changes only when you deploy.
- PPR - Partial Prerendering: use when one page mixes a static shell with a few dynamic parts. It is already on: `cacheComponents: true` in `apps/web/next.config.ts` turns it on in Next.js 16.

## Parallel routes

### What parallel routes solve

One layout shows more than one page at the same time. Each `@name` folder is a slot. The parent layout gets each slot as a prop with that name, next to `children`. Each slot has its own `loading.tsx` and `error.tsx`, so a slow or broken slot doesn't hold up or break the rest of the page. On a link inside the app, a slot keeps showing its page even when the URL no longer matches it.

### When to use parallel routes

- Parts of one screen that load, fail or change on their own, such as panels on a dashboard.
- A part that the layout shows or hides by a condition, such as a member's role.
- A modal with its own URL, together with an intercepting route (see below). The `@modal` slot in `app/(app)` does this for the thread over `/feed` (FEED-16).

Don't use a slot only to split a page into pieces. Plain components inside `<Suspense>` do that.

Rules:

- Give every slot a `default.tsx`. On a full page load Next.js can't know what the slot showed before, so it renders `default.tsx`. Without one, the route returns a 404. Return `null` when the slot should show nothing.
- A slot is not part of the URL. `app/(app)/@modal/x/page.tsx` serves `/x`, not `/@modal/x`.
- To close a modal slot when the member goes to another page, add `@modal/[...catchAll]/page.tsx` that returns `null`.

## 'use cache'

### What 'use cache' solves

With `cacheComponents: true`, every page runs again on every request unless you say otherwise. `'use cache'` at the top of a file, a component or an async function keeps its output and reuses it. A cached component becomes part of the static shell that PPR sends first. `cacheLife()` says how long the entry lives. `cacheTag()` names the entry so a write can expire it. This is how ISR works now: the old `export const revalidate` is not allowed.

### When to use 'use cache'

- Public data that is the same for every visitor and can be a little out of date, such as the splash ticker, the hashtag list and the Stranger's daily line.
- Slow work whose result depends only on its arguments.

Don't use it for anything that belongs to one member. Read per-member data inside a `<Suspense>` boundary instead, so it streams in after the shell.

Rules:

- Never call `cookies()`, `headers()` or read `searchParams` inside `'use cache'`. Next.js throws. Read them outside the cached scope.
- The arguments and any values the function uses from outside become part of the cache key. They must be values that can be serialized, such as strings, numbers and plain objects.
- Call `cacheLife()` with a named profile (`'minutes'`, `'hours'`, `'days'`, `'max'`) in every cached scope, so the reader can see how stale it may be.
- Call `cacheTag()` whenever a write can change the data. After the write, call `updateTag(tag)` in the Server Action when the writer must see the change at once. Call `revalidateTag(tag, 'max')` when other readers can wait for a background refresh.
- Route segment exports `dynamic`, `revalidate` and `fetchCache` are not allowed with Cache Components on.

## Intercepting routes

### What intercepting routes solve

A link opens another route inside the current layout, so the member doesn't lose their place. The URL changes to the target route, so the view can be shared. A refresh, or opening the shared link, shows the target's full page instead. With a `@modal` slot this gives a modal that:

- has a URL you can share
- shows the full page on refresh instead of losing the content
- closes on Back, and opens again on Forward

### When to use intercepting routes

- A detail view that opens over a list and keeps the list's place, while it also has a full page of its own. Example: the thread at `/abidings/[id]` opens as a modal over `/feed` (FEED-16).
- A form or panel that opens over the current page from a link, such as a sign-in modal from the header while `/login` stays a real page.

Don't use it when the content has no page or URL of its own. Use the `Dialog` part from `src/components/ui/` instead.

Rules:

- Name the folder by how far up the target is, counted in route segments: `(.)` the same level, `(..)` one level up, `(..)(..)` two levels up, `(...)` from the `app` root. `@slot` folders don't count as a level.
- Always build the target's full page too, for example `app/(app)/abidings/[id]/page.tsx` next to `app/(app)/@modal/(.)abidings/[id]/page.tsx`. A full page load never uses the intercepting route.
- Close the modal with `router.back()`, so Back and Forward behave as the member expects.
