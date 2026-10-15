# Frontend architecture

## Status and purpose

This is the plan for the Dudesphere web app, `apps/web` (`@dudesphere/web`). It
runs on Next.js 16.4 and React 19.3. The scaffold lands on the
`chore/fullstack-setup` branch as story WEB-5. No page is built yet.

The backend is described in [overview.md](./overview.md). The workspace that
holds both apps is in [fullstack-architecture.md](./fullstack-architecture.md).
The work is tracked as the Lebowski epic in
[epic-lebowski/index.md](./epic-lebowski/index.md). Every route's rendering
strategy is recorded in
[epic-lebowski/rendering-strategies.md](./epic-lebowski/rendering-strategies.md).

The app is a Dude community: part Twitter, part forum. It grows into a set of
Big Lebowski and Dudeism experiences, anchored by Lane Night, an async bowling
game. The MVP is 2D with strong motion. A 3D world, where a yin-yang bowling
ball rolls through Venice beach, a bowling alley and the Mojave desert, comes
after the MVP as WORLD-48.

The web app is also a lesson. Each page uses a different Next or React
rendering strategy on purpose, so that the app covers every strategy Next
offers.

**Security release.** Next.js announced an out-of-band security release on
2026-10-14, with 2 Critical and 1 High advisory. Pin the patched 16.4.x as soon
as it is on npm, before any page ships.

## Decisions

| Choice           | Pick                                                                                                  | Why                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js 16.4, React 19.3, App Router, Turbopack, Node runtime only                                    | Every rendering strategy in one framework, on the newest Next and React. Cache Components and React Compiler are on                                                  |
| Why Next now     | Nuxt 4 was the plan until 2026-10-14                                                                  | Craig reversed it: the web app is now a lesson in Next's rendering strategies. The Nuxt plan was never built                                                         |
| Language         | TypeScript, strict                                                                                    | Same as the API. The base options come from `packages/config/tsconfig.base.json`                                                                                     |
| Styling          | CSS Modules, CSS variables in `src/styles/tokens.css`, `motion/react` for movement                    | Plain CSS per component, tokens for light and dark. No Tailwind                                                                                                      |
| UI parts         | Shared parts in `components/ui/`, with Base UI (`@base-ui/react`) behind the ones that need behaviour | Each look written once. Base UI ships no styles, so our tokens drive it. Rules in the `ui-composition` skill; chosen 2026-10-15 (`context/audits/frontend-audit.md`) |
| 3D               | React Three Fiber, `@react-three/drei`, `@react-three/rapier`, `@react-three/postprocessing`          | After the MVP, as WORLD-48. The React renderer for three.js has the largest set of examples                                                                          |
| Server state     | Server Components fetch on the server. TanStack Query 5 on the client                                 | Server Components render the first page. `useInfiniteQuery` pages on `links.next`. `refetchInterval` polls live games                                                |
| Global state     | None in the MVP                                                                                       | The URL, Server Components and the query cache hold everything the MVP needs                                                                                         |
| Forms            | `<form action={serverAction}>` with `useActionState`                                                  | Field errors come straight from Nest's 400 body. No zod and no form library. Compared with React Hook Form and TanStack Form in `context/audits/forms-analysis.md`   |
| Auth storage     | httpOnly cookies set by Next (the BFF)                                                                | Page scripts never see a token. The browser never calls Nest. See "Auth as a BFF"                                                                                    |
| Images and fonts | `next/image`, `next/font`                                                                             | Resizing, modern formats and self-hosted fonts with no layout shift                                                                                                  |
| Dates            | `@northguild/gmt`                                                                                     | The zero-`Date` rule covers `apps/web`. The root oxlint config enforces it                                                                                           |
| Tests            | Vitest with `@testing-library/react`, Playwright with `instant()` from `@next/playwright`             | Vitest matches the API. Playwright drives the real browser that View Transitions and the lane canvas need                                                            |

## Layout of `apps/web/src`

```text
apps/web/src/
  app/
    layout.tsx, layout.module.css, not-found.tsx, error.tsx, forbidden.tsx
    (public)/page.tsx                        splash
    (public)/login, signup, forgot-password, reset-password
    (app)/feed/page.tsx, loading.tsx
    (app)/@modal/(.)abidings/[id]/page.tsx   intercepting route: the thread as a modal
    (app)/abidings/[id]/page.tsx             the thread as a full page
    (app)/dudes/[id], dudes/me
    (app)/lanes/..., abide/..., rug/..., laws/..., stranger, groups/..., nights/...
    (app)/admin/...
    lab/page.tsx                             the rendering-strategies index (WEB-11)
    api/auth/{login,signup,logout,refresh}/route.ts
    api/bff/[...path]/route.ts               client fetches, Bearer added on the server
    api/lanes/ticker/route.ts                SSE
    sitemap.ts, robots.ts, opengraph-image.tsx
  proxy.ts
  lib/api.ts          typed fetch to Nest, Bearer from the DAL, maps 400 field errors
  lib/session.ts      'server-only' Data Access Layer: verifySession = cache(...), cookie helpers
  lib/actions/*.ts    Server Actions (lib/actions/theme.ts sets the theme cookie)
  lib/theme.ts        theme cookie name and value check
  lib/motion.ts       motion/react presets that copy the --dur-* tokens
  components/ui/*     shared parts (Button, Text, Field, Stack, Dialog...), each with a .module.css
                      and a spec. They know nothing about the app. Only these import @base-ui/react (WEB-54)
  components/*        feature components that compose the shared parts, each with a .module.css
                      for layout only
  styles/tokens.css   CSS variables, light and dark
  styles/globals.css  reset and base rules
  styles/motion.css   motion rules: .enter, reduced-motion View Transitions
```

Route groups such as `(public)` and `(app)` share a layout only. They do not
check auth. Each page, Server Action and Route Handler checks for itself.

`next.config.ts` turns on `cacheComponents`, `reactCompiler` and
`transpilePackages: ['@dudesphere/api-types', '@dudesphere/lane-engine']`. It
also sets `agentRules: false` and `experimental.agentUpgrade: false`, because
the root `AGENTS.md` is the only agent file.

## Auth as a BFF

Next is the backend for the frontend (BFF). Nest stays bearer-only, with no
cookies and no CORS. The browser talks only to Next.

**Sign in.** `POST /api/auth/login` calls Nest `POST /auth/token` with
`{ identifier, password }`. Nest answers `{ accessToken, refreshToken, expiresIn }`.
The handler sets two cookies, both `httpOnly`, `secure` and `sameSite: 'lax'`:

- `session` holds the access token, with `path: '/'` and `maxAge: expiresIn`.
- `refresh` holds the refresh token, with `path: '/api/auth'` and a lifetime of
  7 days. Only the refresh and logout handlers ever receive it.

**Sign up.** `POST /api/auth/signup` calls Nest `POST /auth/sign-up`, then runs
the same sign-in step.

**The Data Access Layer.** `lib/session.ts` imports `server-only`, so a client
component cannot import it.

- `verifySession()` reads the `session` cookie and decodes `exp` locally. It does
  not verify the signature: Nest does that on every call. It returns
  `{ accessToken, exp }` or `null`. React's `cache()` wraps it, so it runs once per
  request.
- `getMe()` calls Nest `GET /users/me` once per request, also through `cache()`.
  The token carries no role on purpose. The role comes from `getMe()`, because
  Nest reads it from the database on every request.

**Refresh.** `proxy.ts` runs on the Node runtime before each route. When the
`session` cookie is missing or expires within 60 seconds, and the request is a
document navigation, it redirects to `/api/auth/refresh?next=<path>`. An RSC
prefetch carries the `Next-Router-Prefetch` header. A prefetch is never
redirected; with a dead session it renders as anonymous.

The refresh handler calls Nest `POST /auth/token/refresh` with the refresh
token, sets both cookies from the answer, and redirects back to `next`.

**One refresh at a time.** A refresh token works once, and Nest ends the whole
sign-in if one is used twice. The handler keeps a `Map` from a hash of the
refresh token to its pending promise, so two requests that arrive together share
one refresh on each server instance. On a 401 "Refresh token invalid", "expired"
or "reused", the handler clears both cookies and redirects to `/login?next=`.

**Client fetches.** Client components call `/api/bff/*` Route Handlers, which add
the Bearer from the `session` cookie and call Nest. These handlers never
refresh. On a 401 the client fetch wrapper calls `/api/auth/refresh` once, with
one shared promise in the browser, and retries the request.

**Log out.** A Server Action calls Nest `POST /auth/token/revoke` with the refresh
token, then clears both cookies. "Log out everywhere" calls
`POST /auth/sign-out-everywhere`. Nest ends the sign-in, access tokens included,
because every access token carries the sign-in's id (`sid`). Clearing the
cookies still matters: dead tokens left in them would cost a 401 and a failed
refresh on the next page.

**Where auth is checked.** Every Server Action and Route Handler re-checks the
session itself. Layouts never check auth, because a layout does not re-render on
every navigation. With Cache Components on, `cookies()` is read only inside a
`<Suspense>` boundary and never inside `'use cache'`.

**Correction to the old plan.** The Nuxt plan limited the refresh cookie to the
refresh and logout paths. It also expected a server middleware on every request
to refresh the session. That middleware could never see a path-limited cookie,
so it could never refresh. The redirect to `/api/auth/refresh` above fixes this:
the only code that needs the refresh cookie runs on the path that receives it.

Rate limits from Vercel need a backend change, API-10. See "Backend gaps".

## Sign-in experience

AUTH-52 makes sign-in easy. It is the first story of Phase 1.

`/login` becomes "Roll in". One screen holds:

- an email field with passkey autofill (`autocomplete="username webauthn"`);
- "Email me a link";
- "Use a passkey";
- "Continue with Google" and "Continue with GitHub";
- a small "Use a password" link. Passwords stay as a fallback for existing
  accounts.

How each path works:

- **Email links.** Nest implements `MagicLinkHandler` from
  `@nestjs/authentication`. The package binds each link to the browser that asked
  for it, through a `__Host-magic_link_tx` cookie. Nest stays cookie-free, so the
  Next Route Handler forwards the browser's `Origin`, relays that cookie to the
  browser, and sends it back when the link is used. The emailed link opens a Next
  page that POSTs the token, because mail scanners follow GET links.
- **Email verification.** A link works only for an address that was verified,
  or whoever registered the address first keeps access. AUTH-52 adds email
  verification to Nest and marks an address verified when a link is used.
- **Passkeys.** A new Nest module on `@simplewebauthn/server` 14. The web side uses
  `@simplewebauthn/browser` 14. The relying party id is the web origin's host,
  because the browser talks only to Next. After a first sign-in, the app offers
  "Add a passkey".
- **Social.** `OidcService` presets for Google and GitHub, with the same browser
  binding and relay as email links. An existing account is linked only by a
  provider-verified email.
- **Passwordless sign-up.** Email plus display name. Username and password become
  optional, a schema change decided inside the story.

Every path ends with the same token pair from Nest, and the same two cookies.
Link requests are limited like forgot password: 3 per 15 minutes per email and
IP. AUTH-52 may split into AUTH-52a (links and verification), AUTH-52b (passkeys)
and AUTH-52c (social).

## Pages and flows

Every page names its Next route file, its rendering strategy, and the Nest
routes it calls. The Nest routes are in [overview.md](./overview.md) unless a
line says "backend gap". The browser never calls Nest. A Server Component,
Server Action or Route Handler in `apps/web` calls Nest through `lib/api.ts`,
with the Bearer from the `session` cookie.

### Splash `/`

Public. What a visitor sees first. Story FEED-12.

- Route file: `app/(public)/page.tsx`.
- Strategy: a static shell with cached parts. The ticker and the hashtag list are
  Server Components marked `'use cache'`, with `cacheLife('minutes')` and
  `cacheTag('abidings')` or `cacheTag('hashtags')`. The "who is signed in" corner
  reads `cookies()` inside `<Suspense>`, so it streams in and the rest stays
  static.
- Hero copy and two calls to action: "Roll in" to `/login`, "Sign up" to
  `/signup`.
- A ticker of recent public abidings from `GET /abidings?limit=10`.
- The live hashtag list from `GET /hashtags?limit=30`.
- Scroll-driven parallax on the backdrop layers through CSS
  `animation-timeline: scroll()`, so it costs no JavaScript.

### Sign up `/signup` and log in `/login`

Stories AUTH-7, AUTH-9 and AUTH-52.

- Route files: `app/(public)/login/page.tsx`, `signup/page.tsx`,
  `forgot-password/page.tsx` and `reset-password/page.tsx`.
- Strategy: a static shell with a client form. Each form is a client component
  that uses `useActionState` with a Server Action in `lib/actions/auth.ts`.
  `reset-password` reads `searchParams`, which is async, inside `<Suspense>`.
- The Server Actions and the `api/auth/*` Route Handlers share one helper that
  calls Nest and sets the cookies. AUTH-7 decides whether the forms post to the
  Server Actions, the Route Handlers, or both.
- Sign up calls `POST /auth/sign-up`, then `POST /auth/token` with the same
  credentials, then sets the cookies.
- Log in calls `POST /auth/token`.
- Until AUTH-52 lands, the login form has one input, labelled "Username or
  email", and a password. It posts `{ identifier, password }`. The API decides
  which of the two the identifier is and ignores its letter case, so the form
  does neither.
- The sign up form says a username cannot hold `@` or spaces. The API answers
  400 for one that does.
- The sign up form also asks for a display name, and says that it is the name
  other members see and that the username is only for logging in. It posts
  `profile: { displayName }`. The API answers 409 `DISPLAY_NAME_TAKEN` for a
  name in use, in any letter case, and the form shows that under the input.
- "Forgot password?" on the login page opens `/forgot-password`: one email input.
  Its Server Action calls `POST /auth/password/forgot`. The API answers 202
  whether or not the address has an account, so the page always says "If that
  address has an account, we sent it a link."
- The emailed link opens `/reset-password?token=...`. Nest builds the link from
  `FRONTEND_URL`, which now points at the web origin (3001 locally). The page
  reads `token` from the URL and asks for the new password twice, and checks
  the two match itself. Its Server Action calls `POST /auth/password/reset` with
  `{ token, password }`; the API takes no `confirmPassword`. On 204 it sends the
  visitor to `/login`. On 400 `RESET_TOKEN_INVALID` it says the link no longer
  works and offers `/forgot-password` again.
- A 429 from login or forgot password carries `Retry-After`, in seconds. The form
  shows how long to wait.
- A 400 from Nest carries the field messages. `lib/api.ts` maps them to a
  `{ fieldErrors }` object, the Server Action returns it, and `useActionState`
  shows each message under its input. No client-side validation library.

### Feed `/feed`

The signed-in home. This is the Twitter part. Stories FEED-13 and FEED-14.

- Route files: `app/(app)/feed/page.tsx` and `loading.tsx`.
- Strategy: dynamic and streamed. `loading.tsx` paints at once. The first page
  of abidings renders on the server inside `<Suspense>`, where the page reads
  `cookies()`.
- Newest first, from `GET /abidings`. Infinite scroll with `useInfiniteQuery`
  from TanStack Query, seeded with the server's first page.
  `getNextPageParam` returns `links.next`, and the query stops when it is `null`.
  Later pages go through `/api/bff/abidings`. An `IntersectionObserver` on the
  last card asks for the next page.
- Hashtag filter chips. Up to 10 at once, sent as `GET /abidings?hashtag=a,b`.
  `useDeferredValue` keeps typing in the chip search smooth while the list
  updates.
- Compose box. A Server Action calls `POST /abidings`. `useOptimistic` adds the
  card the moment the member posts. On 201 the action calls
  `updateTag('abidings')`, the card settles, and the strike plays. On an error
  the optimistic card slides out and the message returns to the box.
- Reply from any card. A reply is `POST /abidings` with `replyToId`. It appears
  in the feed like any other abiding and links to its thread.
- Long feeds use `content-visibility: auto` on cards below the fold.

### Thread `/abidings/[id]`

The forum part. One abiding and the conversation under it. Story FEED-16.

- Route files: `app/(app)/abidings/[id]/page.tsx` for a full page load, and
  `app/(app)/@modal/(.)abidings/[id]/page.tsx`, an intercepting route that opens
  the thread as a modal over the feed.
- Strategy: the abiding is cached with `'use cache'` and
  `cacheTag('abiding:<id>')`. The author's profile and the replies stream in
  under `<Suspense>`. A reply's Server Action calls
  `revalidateTag('abiding:<id>', 'max')`. A missing abiding calls `notFound()`.
- The abiding comes from `GET /abidings/:id`, which is public and carries the
  author's `displayName`. A signed-in visitor also gets the author's profile from
  `GET /profiles/user/:id`. An anonymous visitor sees the abiding and the display
  name only, because profiles need a token.
- No page shows another member's username. The API does not send one.
- Its replies, newest first. **Backend gap:** this needs
  `GET /abidings?replyToId=:id`, which does not exist yet. That is API-15.
- The feed stays mounted behind the modal. React's `<Activity>` keeps the feed's
  state and scroll position, so going back makes no new request.
- The author avatar sits inside `<ViewTransition name="avatar-<id>">`, so it
  slides from the feed card into the thread header.

### Dude `/dudes/[id]` and `/dudes/me`

A member's page. Story FEED-17.

- Route files: `app/(app)/dudes/[id]/page.tsx` and `app/(app)/dudes/me/page.tsx`.
- Strategy: dynamic and streamed, with `cookies()` inside `<Suspense>`. The edit
  forms use Server Actions with `useActionState`.
- `GET /profiles/user/:id` and `GET /abidings?userId=:id`, paginated like the
  feed. Both need a signed-in visitor here, the first because profiles need a
  token. An anonymous visitor is sent to `/login?next=`.
- The page is headed by the member's `displayName`, which the profile carries.
  `/dudes/me` also shows the member their own username, from `GET /users/me`.
- `/dudes/me` adds edit forms whose Server Actions call `PATCH /users/me` and
  `PATCH /profiles/me`, and a "Leave the sphere" button for `DELETE /users/me`
  with a confirm step. Field errors pass through from Nest's 400.
- `isDude` and `ordainedDate` show as a badge: "Ordained 12 March 2024". Dates
  format through `@northguild/gmt`, never a `Date`.
- URLs carry the member's numeric id: `/dudes/42`. There is no lookup by display
  name and none is planned. Never by username: that is a login name and stays out
  of URLs.

### The Sphere `/sphere`

A globe showing where the dudes are. The "dudes near you" feature lives here.
It is story SPHERE-50, after the MVP, and its globe is part of the World.

- Route file: `app/(app)/sphere/page.tsx`. The globe is a client component inside
  the World canvas. The list beside it streams from the server.

Location is **opt-in and off by default**. A member picks one of three modes on
`/dudes/me`:

| Mode        | What others see                                                | Stored                  |
| ----------- | -------------------------------------------------------------- | ----------------------- |
| `off`       | nothing. The default                                           | nothing                 |
| `anonymous` | one more dot in a coarse cell. No name, no link                | coarse cell only        |
| `named`     | the dot, plus the member in "dudes near you" with a city label | coarse cell and a label |

Privacy rules the frontend enforces and the backend repeats:

- Never store or send precise coordinates. The browser rounds the position
  to a geohash of length 4, about 20 by 40 km, before it leaves the device.
  The API stores that cell and nothing finer.
- The browser asks for location only after the member clicks "Use my
  location". Never on page load. `navigator.permissions.query({ name: 'geolocation' })`
  tells the page whether to show the button or a "blocked in your browser"
  note, and `navigator.geolocation.getCurrentPosition` runs inside the click
  handler.
- A member can type a city instead of sharing GPS. The page geocodes it to
  the same coarse cell, so GPS is never required.
- An anonymous cell shows a dot only when it holds at least three members.
  Below that it shows nothing, so one anonymous dude in a small town is not
  one dot on their town.
- "Turn off" deletes the cell and label. It does not keep history.

What the page shows:

- The globe is a sphere with an Earth texture, a star field, and one dot per
  cell with a count. Dots pulse inside `useFrame`. The ball orbits slowly.
- "Dudes near you" is a list beside the globe: named members in the
  viewer's cell and its eight neighbors, from `GET /dudes/nearby`. It is
  empty with a kind message when the viewer has location off.
- Clicking a dot flies the camera to it and filters the list to that cell.
- A member in `named` mode gets a small "near Venice, CA" line on their
  `/dudes/[id]` page.

**Backend gaps:** all of it. The design is in the "Dude location" entry of
[overview.md](./overview.md) under "Deferred work". It lives in Postgres,
beside the profile, because the relation is keyed by `user.id`.

**Not a 4D world.** A fourth dimension here would mean a time axis, such as
scrubbing through where dudes were. That means storing location history,
which the privacy rules above forbid, and it adds nothing a member asked
for. The globe is a sphere. That is already the name on the door.

### Admin `/admin`

Story FEED-19.

- Route files: `app/(app)/admin/users/page.tsx` and `app/(app)/admin/hashtags/page.tsx`.
- Strategy: dynamic. Each page and each admin Server Action calls
  `requireAdmin()` from `lib/session.ts`. It reads the role from `getMe()` and
  calls `forbidden()` for anyone who is not `admin`, which renders
  `app/forbidden.tsx`. `forbidden()` needs `experimental.authInterrupts: true`.
  Each admin action writes an audit line inside `after()`, once the response is
  sent.
- Nest still enforces the role on every call, so `requireAdmin()` is a
  convenience, not the guard.
- `/admin/users`: `GET /users` paginated, with soft delete (`DELETE /users/:id`)
  and restore (`POST /users/:id/restore`). Deleted rows show greyed with a
  restore button.
- `/admin/hashtags`: `GET /hashtags` plus hide (`DELETE /hashtags/:slug`) and
  restore (`POST /hashtags/:slug/restore`). Hidden tags need a list route that
  includes them. **Backend gap:** `GET /hashtags` returns live tags only. That is
  API-18.
- Plain tables, keyboard friendly. `motion/react`'s `AnimatePresence` animates
  rows in and out.

## The experiences

Each experience is sized and specified in
[epic-lebowski/experiences.md](./epic-lebowski/experiences.md), with its
research in [epic-lebowski/research.md](./epic-lebowski/research.md). The
stories are in [epic-lebowski/tracker.md](./epic-lebowski/tracker.md).

**Lane Night.** An async bowling game against friends, one frame per turn, with
many games at once. The 2D lane, the release meter and the scorecard are client
components (LANE-24). Nest computes pinfall from the inputs and a server seed;
Next re-runs the same `@dudesphere/lane-engine` code to animate the roll before
the answer lands (API-23). An overstep is "Over the line!": the delivery counts
as a foul, scores zero, and the "MARK IT ZERO" stamp plays. A live game polls
with `refetchInterval` (LANE-25), and an SSE ticker shows rolls across the alley
(LANE-27). The Score Sheet logs a real alley game with the same engine (LANE-28).

**Rituals.** The daily "The Dude abides" check-in keeps soft streaks with no
shaming, and `after()` bumps the streak (ABIDE-30). The Take-It-Easy timer runs
in the browser for 1 to 10 minutes and posts a session through a Server Action
(ABIDE-31). Shomer Shabbos quiet mode pauses turn clocks on the day the member
picks, with every date through `@northguild/gmt` (ABIDE-32).

**Identity.** The Rug is a profile theme from a seeded pattern generator, a pure
function in Next (RUG-33). The Laws of the Lane quiz is fully static (RUG-34).
The Lane Certificate is an `ImageResponse` share card that links to dudeism.com
for real ordination and never implies Dudesphere ordains anyone (RUG-35). Ask the
Stranger serves a daily curated aphorism with `cacheLife('days')` (RUG-36).

**Achievers.** Groups give a city or interest chapter its own feed filter
(ACHV-38). Bowling Nights schedule real meetups with RSVP and check-in, and a
group leaderboard draws on Lane Night and Score Sheet games (ACHV-40).

**The bar and the rules.** The Caucasian Bar is a recipe post type with a 21+
attestation on the profile (FEED-42). Walter's Rules gives moderation its voice:
"Over the line" is a warning, "Mark it zero" removes a post, and "Calmer than you
are" nudges before posting. The guidelines page, "There are rules", is static
(MOD-44).

## Motion and View Transitions

`motion/react` handles movement in the DOM. React's `<ViewTransition>` handles
page swaps and shared elements. CSS does the rest where it can.

- **Page swaps.** Next wraps navigations in a transition, and
  `<ViewTransition>` animates the swap through the browser's View Transitions
  API. It needs no config: `ViewTransition` comes from `'react'`, and there is
  no `experimental.viewTransition` flag.
- **Typed moves.** `transitionTypes` on `<Link>` names the move, such as
  `to-thread` or `back`. CSS picks the slide for each type through
  `:active-view-transition-type()`.
- **Shared elements.** The author avatar carries
  `<ViewTransition name="avatar-<id>">` from the feed card into the thread header.
- **Micro-animations.** `motion/react` for button press, card enter and leave,
  chip toggle, the optimistic post sliding in, toasts and the admin table rows.
  Import from `motion/react`, never from `framer-motion`.
- **CSS first.** Enter animations that need no JavaScript use CSS
  `@starting-style`. The splash parallax uses scroll-driven animation,
  `animation-timeline: scroll()`.

The rules:

- 150 to 250 ms, ease-out. Nothing longer except the four signature 3D
  moves.
- Never block input. A button responds on press, not after its animation.
- Every animation has a reduced-motion branch, through `useReducedMotion()` from
  `motion/react` or a CSS `prefers-reduced-motion` media query.
- `MotionConfig reducedMotion="user"` wraps the app (`MotionProvider`), so
  `motion/react` drops transform animations under reduced motion.
- Under reduced motion, `tokens.css` sets `--dur-fast`, `--dur-base` and
  `--dur-slow` to 0.01 ms and leaves `--dur-fade` (150 ms) alone, so state
  changes still fade.
- React does not skip a View Transition under reduced motion on its own. A
  `@media (prefers-reduced-motion: reduce)` rule in `styles/motion.css` turns
  every `::view-transition-*` animation into a `--dur-fade` opacity change.

**Theme.** The theme lives in a `theme` cookie (`lib/theme.ts`). An inline
script in the root layout's `<head>` sets the theme attribute on `<html>`
before first paint, so there is no flash. The toggle in the footer is two
plain `type="button"` buttons, with no form post. A press updates the screen,
then calls `setTheme(intent)` in `lib/actions/theme.ts` directly. The toggle
sends its intent: the unpressed button sends its own theme, and the pressed
button sends `system`. The action does exactly that. `light` or `dark` sets the
cookie, `system` deletes it so the OS rules again, and anything else writes
nothing. The server never decides from the cookie what a press means. The
action returns the saved theme (or `null`) and the screen adopts that answer.
If the call fails, the toggle reads the saved theme back from the cookie and
shows "Could not save your theme. Try again." only if the save didn't land.
When a tab becomes visible again it re-reads the cookie, so other tabs catch
up. Next runs Server Actions one at a time, so quick presses stay in order. A
press before hydration does nothing, and the streaming fallback can't act. If
focus was on a placeholder button when the real toggle streams in, focus moves
to the matching real button. After the skip link, `#main` shows the focus ring
for keyboard focus only. With
JavaScript off the inline script can't run, so a `<noscript>` style in the
layout's `<head>` hides the toggle and the page follows the OS. The pressed
state has a non-color cue for forced-colors mode, and the "press again" hint is
visible. The toggle uses plain `useState` synced from its `current` prop, not
`useOptimistic`, because the press calls the action directly and not inside a
client transition. `ThemeSetting` reads `cookies()` inside `<Suspense>`, so `/` is
Partial Prerender: a static shell, with the toggle as the one dynamic hole.
Three things to remember:

- The `themeColor` hex values in `layout.tsx` copy `--color-bg`. Change them
  together.
- The layout owns `<main id="main" tabIndex={-1}>`. Pages render no `<main>`.
- A future CSP (WEB-45) can't allow the inline theme script by hash. The page
  carries six other inline scripts from Next, React and Turbopack: the
  `self.__next_f.push` flight payload and the `$RB` and `$RV` reveal scripts.
  They change with the build and, for the streamed part, with each request, so
  they can't be hashed ahead of time. Under CSP Level 2 and later, any hash in
  `script-src` also makes the browser ignore `'unsafe-inline'`. Next's CSP
  guide also says a nonce CSP doesn't work with Partial Prerender. So the real
  choice is `'unsafe-inline'` with no hash, or nonces that make every page
  dynamic, or another plan.

**Fonts.** `next/font` sets `--font-bowlby` (Bowlby One) and `--font-atkinson`
(Atkinson Hyperlegible Next). Bowlby One comes from `next/font/google`.
Atkinson is self-hosted with `next/font/local` from `app/fonts/` (latin subset
only, with its OFL licence), so Next builds a size-matched Arial fallback.
Letters outside the latin subset use that fallback. The tokens `--font-display`
and `--font-text` point at them.

## The World, after the MVP

Story WORLD-48. The MVP ships without it. Everything in this section is the old
3D plan, ported from TresJS to React Three Fiber.

### The one world

A single `<Canvas>` from `@react-three/fiber` renders once, in the root layout,
inside a client component named `World`. It is `position: fixed` behind the DOM
at `z-index: 0`, and it is `aria-hidden`. Every page renders above it with a
transparent background.

`World` never renders on the server. It loads as a separate chunk, either with
`next/dynamic` and `ssr: false` inside a client component, or through
`use(browser())`. Confirm `use(browser())` exists in Next 16.4 when building;
the dynamic import works either way.

Text never lives in the canvas. The DOM is the source of truth for content,
links, forms and accessibility. The canvas is set dressing. If the canvas fails
to load, the app still works on a still photo.

A small React context, `WorldProvider`, holds the camera target, the ball state
and the quality tier. WORLD-48 decides whether that needs a store library.

### Stations

Each route group is a place in the world. The camera has a fixed pose at each
one.

| Route            | Place                                              | Backdrop                  |
| ---------------- | -------------------------------------------------- | ------------------------- |
| `/`              | Venice boardwalk at dusk. The ball rolls into view | beach photo HDRI          |
| `/login`         | The alley front desk                               | alley interior            |
| `/signup`        | The shoe counter                                   | alley interior            |
| `/feed`          | The lanes, seen from the ball return               | neon alley, Star Lanes    |
| `/abidings/[id]` | One lane, camera close on the pins                 | same                      |
| `/dudes/[id]`    | A straight Mojave road, the narrator's country     | desert HDRI               |
| `/sphere`        | Earth from orbit. The Dudesphere itself            | globe texture, star field |
| `/admin/*`       | The pinsetter room behind the lanes                | machinery, work lights    |
| `/lanes/*`       | Lane Night, the 2D lane replaced by a modeled one  | neon alley                |

### Realistic backgrounds

The backgrounds are photographs, not models. Each station uses an HDRI
environment map through drei's `<Environment>`, plus two or three large photo
planes at different depths for parallax when the camera moves. The alley and the
pins are the only modeled geometry.

Why: a modeled Los Angeles is months of work and still looks worse than a photo.
An HDRI gives real light and real reflections on the ball for free.

### The ball

A sphere with a yin-yang texture and a rigid body from `@react-three/rapier`. It
is the one object that is always on screen. Between stations it rolls ahead of
the camera. At the lanes it rolls down a lane and knocks over ten pins, which are
Rapier bodies too. The strike is the app's reward animation.

### Page transitions in 3D

A route change becomes a camera move. The steps:

1. `World` reads `usePathname()` and maps it to a station in `WorldProvider`.
2. A `useFrame` callback moves the camera along a spline from its current pose
   to the station's pose. The ball rolls ahead on the same path. The move takes
   600 to 900 ms, eased out.
3. The outgoing and incoming pages swap under `<ViewTransition>`, with the
   `transitionTypes` of the link that started the move. The DOM slides in sync
   with the camera instead of fading.
4. Under reduced motion the camera cuts instead of moving, the ball sits still,
   and the DOM swap is a 150 ms opacity change.

Four moves carry the character of the app and get the most care:

- **Splash to login.** The ball rolls down the boardwalk and through the alley
  doors. The hero copy slides out to the left as the door frame passes.
- **Feed to thread.** The camera dives down one lane toward the pins. The feed
  list shrinks toward the chosen card, which grows into the thread header through
  a shared `<ViewTransition name>`.
- **Posting an abiding.** The ball rolls, the pins fall, and a bloom pass from
  `@react-three/postprocessing` flares the neon. The new card lands in the feed
  on the same beat.
- **Dude to sphere.** The camera lifts off the desert road, the horizon curves,
  and Earth fills the frame with the ball in orbit around it.

### Quality tiers and budgets

- Three quality tiers, chosen on first load and changeable in settings: high
  (full HDRI, bloom, shadows), medium (smaller HDRI, no bloom, no shadows), still
  (a photo per station, no canvas at all).
- `<Canvas frameloop="demand">`. The canvas renders only during transitions, the
  strike, and pointer parallax. Code that moves something calls `invalidate()`.
- Canvas assets load behind `<Suspense>`. The DOM paints first and the still
  photo shows until the HDRI arrives.
- Budgets: under 6 MB of canvas assets across all stations. The World chunk does
  not count toward the 200 KB first-load budget, because it loads after the page.
- WebGPU through `WebGPURenderer` from `three/webgpu` is optional, with WebGL as
  the fallback. Confirm how React Three Fiber accepts it when building.

## Browser, React and Next features

| Feature                                   | Used for                                                                    | Note                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `'use cache'`, `cacheLife`, `cacheTag`    | splash ticker and hashtags, the thread's abiding, the Stranger's daily line | needs `cacheComponents: true`                            |
| `<Suspense>`, `loading.tsx`               | stream request data into the static shell                                   | every `cookies()` read sits inside one                   |
| Server Actions                            | sign up, log in, post, edit, admin actions                                  | each one re-checks the session                           |
| Route Handlers                            | the BFF auth steps, `/api/bff/*`, the SSE ticker, `ImageResponse`           |                                                          |
| `proxy.ts`                                | refresh the session before a document navigation                            | Node runtime. Replaces `middleware.ts`                   |
| `useActionState`, `useOptimistic`         | form state and field errors, the optimistic post                            | React 19                                                 |
| `<Activity>`                              | keep the feed alive behind the thread modal                                 | React 19.2 and later                                     |
| `<ViewTransition>`                        | page swaps, the avatar shared element                                       | confirm the export name in React 19.3                    |
| `after()`, `forbidden()`, `notFound()`    | streaks and audit lines, the admin guard, missing abidings                  | `forbidden()` needs `experimental.authInterrupts`        |
| `next/image`, `next/font`                 | backdrops and avatars, the type ramp                                        |                                                          |
| `generateMetadata`, `opengraph-image.tsx` | titles and share cards                                                      | WEB-20                                                   |
| React Compiler                            | memoization without `useMemo` or `useCallback`                              | `reactCompiler: true`                                    |
| View Transitions API                      | behind `<ViewTransition>`                                                   | Chrome, Edge, Safari 18. Firefox falls back to a cut     |
| `prefers-reduced-motion`                  | every animation's off switch                                                |                                                          |
| `navigator.deviceMemory`                  | pick the World's quality tier on first load, with `hardwareConcurrency`     | Chromium only. Others get the medium tier                |
| Geolocation API, Permissions API          | the Sphere's "Use my location" button                                       | after a click only. Rounded on the device before sending |
| WebAuthn                                  | passkeys, with conditional UI on the email field                            | through `@simplewebauthn/browser`                        |
| `EventSource`                             | the Lane Night ticker                                                       | reconnects on its own when the 25 s stream closes        |
| Web Audio API                             | lane sounds, the "MARK IT ZERO" stamp                                       | starts after a user gesture only                         |
| Canvas 2D                                 | the MVP lane and the release meter                                          | no library                                               |
| CSS scroll-driven animations              | splash parallax                                                             | Chrome, Edge, Safari 26. Firefox shows a still           |
| Popover API, CSS anchor positioning       | menus and the compose box's emoji picker                                    | anchor positioning is Chromium and Safari 26             |
| `@starting-style`                         | CSS-only enter animations                                                   |                                                          |
| `IntersectionObserver`                    | infinite scroll trigger                                                     | a small hook in `lib/`, no helper library                |
| `content-visibility: auto`                | long feeds                                                                  |                                                          |
| WebGPU renderer                           | `WebGPURenderer` from `three/webgpu`, WebGL fallback                        | World only. Optional. Confirm stability when building    |

Speculation Rules are left out. `<Link>` prefetching and Partial Prefetching
cover the same need inside the Next router.

## Performance and accessibility

- Budgets: first paint under 1.5 s on a mid-range phone over 4G, and under
  200 KB of JavaScript on first load.
- Server Components render by default. A component becomes a client component
  only when it needs state, effects or a browser API.
- Partial Prefetching (`partialPrefetching: true`) and `<Link prefetch>` make
  navigations instant. WEB-46 proves it with `instant()` from `@next/playwright`.
- Every page works with keyboard alone. Focus order follows the DOM.
- Color contrast is checked against the photo backdrops. Cards carry a solid or
  frosted background so text never sits on a raw photo.
- Every page has a reduced-motion pass in WEB-47.
- The 2D lane exposes the frame, the score and the result as text in the DOM, so
  a screen reader can follow a game.

## Packages

Versions are to confirm before `pnpm add`. `next@16.4.0` and `react@19.3.0` were
checked on npm on 2026-10-14.

| Package                       | Role                                         | Version to confirm                   |
| ----------------------------- | -------------------------------------------- | ------------------------------------ |
| `next`                        | framework                                    | 16.4.x, the patched security release |
| `react`, `react-dom`          | UI                                           | 19.3                                 |
| `@tanstack/react-query`       | client server state, infinite queries        | 5.x                                  |
| `motion`                      | DOM micro-animations, through `motion/react` | latest                               |
| `three`                       | 3D engine, World only                        | latest                               |
| `@react-three/fiber`          | React renderer for three                     | 9.x, for React 19                    |
| `@react-three/drei`           | `<Environment>`, cameras, loaders            | latest matching Fiber                |
| `@react-three/rapier`         | physics for the ball and pins                | latest matching Fiber                |
| `@react-three/postprocessing` | bloom for the strike                         | latest matching Fiber                |
| `@simplewebauthn/browser`     | passkeys                                     | 14.x, matching the server's 14       |
| `@northguild/gmt`             | dates                                        | same as the API                      |
| `server-only`                 | keeps the DAL out of client bundles          | latest                               |
| `@dudesphere/api-types`       | response types                               | `workspace:*`                        |
| `@dudesphere/lane-engine`     | bowling scoring and the pin model            | `workspace:*`                        |
| `babel-plugin-react-compiler` | React Compiler                               | matching Next                        |
| `vitest`                      | unit and component tests                     | same Vitest as the API               |
| `@testing-library/react`      | component tests                              | latest                               |
| `@playwright/test`            | browser flows                                | latest                               |
| `@next/playwright`            | the `instant()` helper                       | matching Next                        |

The `@react-three/*` packages wait for WORLD-48. They are listed so the World
plan has its versions in one place.

## Build order

The tracker is the build order: [epic-lebowski/tracker.md](./epic-lebowski/tracker.md).
Each phase ends with something a person can click through.

0. **Foundation.** The workspace, shared packages, CI, the Next shell, tokens and
   motion rules, BFF auth, the Vercel IP fix, and the `/lab` page.
1. **The Feed.** Passwordless sign-in, splash, feed, compose, thread, dude pages,
   admin, SEO.
2. **Lane Night.** The engine, the tables and routes, the lane UI, turns, taunts,
   the ticker, the Score Sheet.
3. **Rituals and identity.** Check-ins, the timer, quiet mode, the Rug, the quiz,
   the certificate, the Stranger.
4. **Achievers.** Groups, Bowling Nights, the Caucasian Bar, Walter's Rules.
5. **Polish and deploy.** Vercel and Docker deploys, Playwright, the performance
   and accessibility pass.

Later: the World (WORLD-48), live lane rooms (LANE-49), the Sphere (SPHERE-50),
Fest Finder and Day of the Dude (ACHV-51).

## Backend gaps

Things the web app needs that the API does not do yet. Each one is a backend
story and lands before the story that needs it.

| Gap                                     | Story     | Needed by                     | Shape                                                                                                            |
| --------------------------------------- | --------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Count each visitor's IP, not Vercel's   | API-10    | Every page, Phase 0           | `BFF_SECRET`. When `X-Bff-Secret` matches, `AuthThrottlerGuard` reads `X-Client-Ip`                              |
| Email links, passkeys, social sign-in   | AUTH-52   | Sign-in, Phase 1              | Magic links, email verification, a `passkey` table, OIDC for Google and GitHub                                   |
| List replies to one abiding             | API-15    | Thread, Phase 1               | `GET /abidings?replyToId=:id`, same page shape                                                                   |
| Reply count on an abiding               | API-15    | Feed, Phase 1                 | `replyCount` on `AbidingResponseDto`                                                                             |
| List hidden hashtags for the admin page | API-18    | Admin, Phase 1                | `GET /hashtags?includeDeleted=true`, admin only                                                                  |
| Lane Night games                        | API-22    | Lane Night, Phase 2           | Postgres `lane_game`, `lane_player`, `lane_roll`. Create, invite, roll, state, my-turn list                      |
| Server-authoritative pinfall            | API-23    | Lane Night, Phase 2           | Nest runs `pinfall(inputs, seed)` from `@dudesphere/lane-engine` and stores the roll                             |
| Profile extensions                      | API-29    | Rituals and identity, Phase 3 | `rugConfig` jsonb, `alignment`, `quietSchedule`, `checkins` and `timer_sessions` tables, `lane_certificate` flag |
| Groups and the group feed filter        | API-37    | Achievers, Phase 4            | Postgres `achiever_group`, `group_member`. `GET /abidings?groupId=`                                              |
| Bowling Nights                          | API-39    | Achievers, Phase 4            | Postgres `bowling_night`, `rsvp`. Create, RSVP, check-in                                                         |
| Recipe post type                        | API-41    | Caucasian Bar, Phase 4        | Mongo `kind: 'recipe'` on abidings with a recipe sub-document. 21+ attestation on the profile                    |
| Reports and moderation states           | API-43    | Walter's Rules, Phase 4       | Postgres `report`. States Over the line (warning) and Mark it zero (removed)                                     |
| Set, change or clear my location        | SPHERE-50 | Sphere, later                 | `PUT /profiles/me/location`, `DELETE /profiles/me/location`                                                      |
| Dots for the globe                      | SPHERE-50 | Sphere, later                 | `GET /sphere/cells`: cell and count, cells with 3 or more only                                                   |
| Dudes near a cell                       | SPHERE-50 | Sphere, later                 | `GET /dudes/nearby?cell=`: named members in it and 8 neighbors                                                   |
| Image upload                            | none yet  | later                         | today `imageUrl` and `profileImageUrl` are plain URLs                                                            |

The web app takes a URL field for images until upload exists. `FRONTEND_URL` on
Nest also moves to the web origin, so reset links open the Next page (AUTH-9).

## Costs accepted

- **One extra hop.** Every API call from the browser goes through Next first. The
  trade is no CORS and no token in page scripts.
- **Nest alone verifies the JWT.** Next decodes `exp` to decide when to refresh,
  but never checks the signature. A forged cookie gets past `proxy.ts` and fails
  at Nest with a 401. The trade is no signing secret in the web app.
- **The World chunk, later.** WORLD-48 adds a 3D chunk to every page. The trade is
  one world and real 3D transitions. The still tier removes it for people who do
  not want it.
- **Vercel caps a function's duration.** 300 s on Hobby and 800 s on Pro. So the
  SSE ticker closes each stream at 25 s, and `EventSource` reconnects. Live rooms
  that need a long-lived socket go to a Nest WebSocket gateway instead (LANE-49).
- **Photo backdrops are large.** `next/image` and the quality tiers keep them
  inside the 6 MB budget.

## Deferred work

- **The World.** WORLD-48, after the MVP. See "The World, after the MVP".
- **Live lane rooms.** LANE-49, through a Nest WebSocket gateway with CORS for the
  web origin only.
- **WebGPU.** three's WebGPU renderer is optional in the World plan. Turn it on
  when it is stable and the WebGL fallback is proven.
- **Likes and follows.** Not in the backend. Following a tag is already designed
  in `overview.md`.
- **Location history or a time axis on the globe.** Ruled out, not deferred. See
  the Sphere section.
- **Distance in kilometers between two dudes.** Cells are too coarse for it, on
  purpose. "Near" means the same or a neighboring cell.
- **Trending tags.** Already deferred in `overview.md`.
- **Generated API types.** `packages/api-types` is hand-written, with a drift
  check. See `fullstack-architecture.md`.
- **A native app.** Nothing here blocks one. The API is the contract.
