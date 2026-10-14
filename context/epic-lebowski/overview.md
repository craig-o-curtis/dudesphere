# Overview: the Lebowski epic

The Lebowski epic turns Dudesphere into a Next.js web app on top of the existing
NestJS API, and grows the app from a feed into a set of Big Lebowski and Dudeism
experiences. Lane Night, an async bowling game, is the anchor. The MVP is 2D
with strong motion. A 3D world comes after it.

Written on 2026-10-14. The entry point is [index.md](index.md).

## Decisions

Made with Craig on 2026-10-14.

| Topic           | Decision                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16.4.0 and React 19.3.0, checked on npm on 2026-10-14. Cache Components on, Turbopack, React Compiler on, `proxy.ts` not `middleware.ts`, Node runtime only |
| Repo            | Full monorepo move first: Nest to `apps/api`, Next at `apps/web`, shared code in `packages/*`                                                                       |
| Styling         | CSS Modules and CSS variables. No Tailwind                                                                                                                          |
| 3D world        | Kept, after the MVP, as WORLD-48. The MVP is 2D with strong motion                                                                                                  |
| Deploy          | Next on Vercel. Nest in Docker elsewhere, on Railway or Fly, with Neon Postgres                                                                                     |
| Data access     | Nest owns both databases. Next is the BFF and the presentation layer. The two-ORM rule in `AGENTS.md` stands                                                        |
| Real-time       | Async turns plus an SSE ticker in the MVP. Live rooms later, through a Nest WebSocket gateway                                                                       |
| MVP experiences | All four bundles: Rituals, Achievers, Identity, Bar and moderation, plus Lane Night as the anchor                                                                   |
| Issue tracking  | gmt style: `<REALM>-<n>: noun phrase`, one id sequence, `tracker.md` is the source of truth, `issues/<ID>.md` per spec, one GitHub milestone per phase              |
| Sign-in         | AUTH-52, added later on 2026-10-14: email links, passkeys, Google and GitHub on one "Roll in" screen. Passwords stay as a fallback. First story of Phase 1          |

## Architecture

```text
browser
   |  HTTPS, cookies only. No token in page scripts
   v
Next.js 16.4 on Vercel  (apps/web)
   |  pages, Server Actions, Route Handlers, proxy.ts
   |  holds the httpOnly session and refresh cookies
   |  server to server: Authorization: Bearer <accessToken>
   v
NestJS 12 in Docker on Railway or Fly  (apps/api)
   |                         |
   v                         v
Neon Postgres            MongoDB
(TypeORM: users,         (Mongoose: abidings,
 profiles, sign-ins,      hashtags, recipe posts)
 Lane Night, groups,
 nights, reports)
```

- The browser talks only to Next. Next talks to Nest. Nest talks to the
  databases.
- Nest stays bearer-only, with no cookies and no CORS. Next turns the token pair
  into two httpOnly cookies. See "Auth as a BFF" in
  [../frontend-architecture.md](../frontend-architecture.md).
- `packages/lane-engine` runs in both apps. Nest uses it to decide each roll.
  Next uses it to animate the roll before Nest answers.
- `packages/api-types` gives both apps the same response types. A compile-time
  check in `apps/api` fails the build when a DTO drifts from its shared type.
- Locally, the API runs on port 3000 and the web app on 3001. Docker Compose runs
  only the databases and their tools.

## What moves into Next

Next does the work that needs no database. Nothing in this list writes a row.

- Cookie handling for the session and the refresh token.
- Open Graph images and the Lane Certificate, through `ImageResponse`.
- The Rug pattern generator, a pure seeded function.
- Ask the Stranger's aphorism corpus and the daily pick.
- The Laws of the Lane quiz content and its scoring. The result is saved through
  Nest.
- SSE fan-out for the lane ticker. The stream polls Nest every 3 seconds.
- Sitemap, robots and page metadata.
- The 2D lane renderer and the release meter.
- The Take-It-Easy timer. The finished session is saved through Nest.

## Real-time

**Lane Night is async.** One frame per turn, many games at once, rematches, and a
72 hour turn timeout that pauses the game rather than forfeiting it.

- **The engine.** `packages/lane-engine` exports `scoreGame(rolls)`,
  `validateRoll(state, roll)`, `frames(rolls)`, `isComplete(rolls)`, a seeded pin
  model `pinfall({ aim, power, spin, timing }, seed)` and `isFoul(timing)`. A roll
  is `{ pins: 0..10, foul: boolean }`. A first-ball foul respots the pins and
  allows the second ball, so "F /" is a spare.
- **Nest decides.** The client sends the inputs: aim on lane boards 1 to 39,
  power, spin and release timing. Nest computes pinfall with the game's seed and
  stores the roll. A client cannot fake a strike.
- **Next previews.** Next runs the same engine on the same inputs to animate the
  roll before Nest's answer lands.
- **"Over the line!"** The release-timing meter has a foul line. An overstep is a
  foul: the delivery counts, pinfall is zero, and the "MARK IT ZERO" stamp plays.
- **Turns.** A live game polls with TanStack Query's `refetchInterval`. A member
  whose turn it is sees "Phone's ringing, Dude".

**The SSE ticker (LANE-27).** A Next Route Handler, `app/api/lanes/ticker/route.ts`,
returns a `ReadableStream` of server-sent events. Inside the stream it polls Nest
every 3 seconds. It closes the stream at 25 seconds, and the browser's
`EventSource` reconnects on its own. This works on Vercel, because each stream
ends well inside the function duration cap.

**Live rooms come later (LANE-49).** Two to six players on one lane in real time
need a long-lived socket. That goes to a Nest WebSocket gateway, which already
holds the game state. CORS opens for the web origin only, on that gateway, and
`overview.md` records why.

**Vercel facts behind this choice.**

- Vercel caps a function's duration at 300 seconds on Hobby and 800 seconds on
  Pro. An SSE stream that never closes would hit the cap.
- Vercel has offered WebSockets as a public beta since 2026-06-22. The plan does
  not use them: the game state lives in Nest, so the socket belongs there too.

## Out of scope for the MVP

- The 3D World (WORLD-48). The MVP is 2D.
- Live lane rooms (LANE-49).
- The Sphere globe and opt-in coarse location (SPHERE-50).
- Fest Finder and the Day of the Dude event (ACHV-51).
- Everything on the parked list in [experiences.md](experiences.md): Larry's
  Homework, Nihilist mode, the Gutterballs reel, the Creedence Tape Deck, Finish
  the Line, "Mark it zero" dispute votes, and Tumbling Tumbleweeds ambient mode.
- Image upload. The web app takes a URL field.
- A global client store, zod forms and Tailwind.
- A native app.

## Risks

1. **The Next.js security release.** Next.js announced an out-of-band security
   release on 2026-10-14, with 2 Critical and 1 High advisory. Pin the patched
   16.4.x the moment it is on npm, and do not deploy before then.
2. **Every request comes from Vercel's IP.** Nest's throttler counts the caller's
   IP. Behind Vercel, every member would share one 100-a-minute budget. API-10
   fixes it: a `BFF_SECRET` env var, and when the `X-Bff-Secret` header matches,
   `AuthThrottlerGuard` counts the IP in `X-Client-Ip`, which Next copies from
   `x-forwarded-for`. Without the matching secret, Nest ignores the header.
3. **Cache Components build errors.** With `cacheComponents: true`, a page that
   reads the API, `cookies()` or `headers()` outside `<Suspense>` fails
   `next build`. The CI `web` job has no API, so it catches this early. A
   `'use cache'` read of the API in a static shell runs at build time too.
   FEED-12 must decide how that read behaves when no API is reachable at build.
4. **IP and trademark.** Universal owns the film and has filed "THE BIG
   LEBOWSKI" trademark applications. Dudeism's name, texts and ordination are its
   own. Do not use "Lebowski" in a feature or product name, film stills, clips,
   the soundtrack, actors' likenesses, or "Lebowski Fest" as a brand. Never imply
   Dudesphere ordains anyone; link out to dudeism.com. Carry a non-affiliation
   disclaimer. Details and sources are in [research.md](research.md) under
   "Legal and IP caveats". This is not legal advice.
5. **The passkey relying party id is tied to the web origin.** The browser talks
   only to Next, so the relying party id is the web app's host. A passkey made on
   `localhost` does not work on the deployed domain, and a later domain change
   strands every passkey. Choose the production domain before AUTH-52b ships.
6. **The refresh redirect.** `proxy.ts` must not redirect an RSC prefetch, or
   prefetching would burn refresh tokens. Prefetches carry `Next-Router-Prefetch`
   and render as anonymous with a dead session.
7. **`pnpm deploy --legacy`** may resolve slightly differently from the workspace
   lockfile. Smoke-test the API image once before the first deploy.

## Corrections to the previous plan

The previous plan was the Nuxt 4 version of
[../frontend-architecture.md](../frontend-architecture.md). It was never built.

| Previous plan                                                                                                                             | Correction                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nuxt 4 and Vue 3.5, chosen so Craig would learn a second ecosystem                                                                        | Next.js 16.4 and React 19.3. Craig reversed the choice on 2026-10-14: the web app is a lesson in every Next rendering strategy, on the newest Next and React                                           |
| The refresh cookie was limited to the refresh and logout paths, and a server middleware on every request was meant to refresh the session | That middleware could never see a path-limited cookie, so it could never refresh. Now `proxy.ts` redirects a document navigation to `/api/auth/refresh`, the one path that receives the refresh cookie |
| Nest's throttler counted the caller's IP, and the plan assumed that was the visitor                                                       | Behind Vercel the caller is Vercel. API-10 adds a shared secret and an `X-Client-Ip` header that only the BFF may set                                                                                  |
| Scoped styles in `.vue` files. Moving to Next, `create-next-app` and most Next guides default to Tailwind                                 | Tailwind is ruled out by name. CSS Modules and CSS variables. The scaffold passes `--no-tailwind`, and skills with Tailwind examples are on the avoid list in `../suggested-frontend-skills.md`        |
| A per-request auth step in `middleware.ts`, on the Edge runtime                                                                           | Next 16 replaced `middleware.ts` with `proxy.ts`, which runs on Node. The Edge runtime is deprecated. Dudesphere uses Node only and never sets `runtime = 'edge'`                                      |
