# FEED-12: Splash page

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 1. Blocked by: WEB-5, WEB-6, AUTH-8, WEB-54.

**Scope:** `/` is a static shell with hero copy and calls to action, a cached ticker of recent abidings and a cached hashtag list, and a small "who is signed in" corner that streams in through Suspense.

## Gap

The web app has no front door. A visitor who lands on `/` sees the WEB-5 placeholder. The splash is also the lesson's first "cached data in a static shell" page: most of it is the same for every visitor, and only the signed-in corner differs.

## Scope

- `apps/web/src/app/(public)/page.tsx`:
  - Hero: heading "The Dude abides. So can you.", one line on what Dudesphere is, and two buttons: "Roll in" to `/login` and "Sign up" to `/signup`. A third, smaller link: "Let's go bowling" to `/lanes` (signed-in members; anonymous visitors go through `/login?next=/lanes`).
  - `<AbidingsTicker />`: the 10 newest abidings, each with the author's display name, the message, and a relative time ("4 min ago") formatted through gmt.
  - `<HashtagCloud />`: up to 30 live tags, each linking to `/feed?tags=<slug>`.
  - `<WhoIsSignedIn />` in the header, inside `<Suspense fallback={<SignInLink />}>`: "Signed in as [display name]" with a link to `/feed`, or "Roll in".
- `apps/web/src/lib/data/abidings.ts`:

  ```ts
  export async function getRecentAbidings(): Promise<Paginated<AbidingResponse>> {
    "use cache";
    cacheLife("minutes");
    cacheTag("abidings");
    return apiFetch("/abidings?limit=10");
  }
  ```

- `apps/web/src/lib/data/hashtags.ts`: `getLiveHashtags()` with `"use cache"`, `cacheLife("minutes")`, `cacheTag("hashtags")`, calling `GET /hashtags?limit=30`.
- Nest routes used: `GET /abidings?limit=10` (Public), `GET /hashtags?limit=30` (Public), and `GET /users/me` (Token) through `getMe()` for the corner.
- Background: a CSS gradient and an original SVG pattern (lane boards, a rug border). No photographs in this story; WORLD-48 brings photo backdrops.
- Scroll-driven parallax on two decorative layers through CSS `animation-timeline: scroll()`, turned off under reduced motion. Firefox shows them still.

## Design notes

- **No auth in the cached functions.** The ticker and the tags are public. A `'use cache'` function never reads `cookies()`.
- **Relative time is computed at render.** A cached "4 min ago" goes stale. The ticker renders the ISO instant into a `<time dateTime>` and a small client component formats it through gmt after hydration. The static HTML shows the absolute date.
- **gmt "now" inside a cached function.** Reading the current time inside `'use cache'` freezes it into the cache. Never do that; the relative-time component reads it on the client.
- **Decision needed: the CI build has no API.** `next build` prerenders the cached ticker and tags, so it calls Nest at build time, and the CI `web` job (REPO-4) runs no API. Option 1 (recommended): the `web` job starts a small fixture server that answers `GET /abidings` and `GET /hashtags` with a fixed page. Option 2: each cached function returns an empty page on a network error. Option 2 is simpler but can cache an empty ticker for minutes in production. Settle it in this story; every later cached page follows the choice.
- **Profanity stays out.** The ticker shows member text as written; the page's own copy has none.
- **The hero copy is original.** "The Dude abides" is a short phrase; no longer quote, no still, no clip.
- **The sign-out message on `/` (AUTH-7 A11Y-4).** A sign-out message shown on `/` at load, such as `?signout=partial` or `?signout=ended`, sits in an `<output>` that is already filled. Screen readers may not announce it. Decide where the message lives when the corner is rebuilt, for example as plain text early in the page. WEB-54's `Notice` is for messages that arrive after load.

## Rendering strategy

Partial prerendering with Cache Components: the shell (hero, layout, footer) is static. The ticker and tags are `'use cache'` with `cacheLife('minutes')` and `cacheTag`, so they are prerendered and refreshed in the background. `<WhoIsSignedIn />` reads cookies inside Suspense and streams at request time. FEED-14's `updateTag('abidings')` refreshes the ticker when someone posts.

## Verification

- `next build` marks `/` as partially prerendered, with the ticker and tags in the static output.
- Anonymous: the corner shows "Roll in". Signed in: it shows the display name, and the rest of the page is byte-identical.
- Post an abiding through FEED-14: the splash ticker shows it on the next load.
- The ticker shows display names only, never usernames.
- The CI `web` job's `next build` passes with whatever the "CI build has no API" decision chose.
- With reduced motion, the parallax layers do not move.
- Keyboard: "Roll in", "Sign up", each tag and each ticker item are reachable in DOM order.

## Done when

- [ ] Splash page with hero, ticker, tags and signed-in corner
- [ ] `getRecentAbidings` and `getLiveHashtags` with `'use cache'`, `cacheLife` and `cacheTag`
- [ ] Client-side relative time through gmt
- [ ] Reduced-motion branch for the parallax
- [ ] Vitest spec for the ticker item and the corner's two states
- [ ] Row added to `rendering-strategies.md`
