# Frontend architecture

## Status and purpose

This is the plan for the Dudesphere web app. Nothing here is built. The
backend comes first and is described in [overview.md](./overview.md). The
repo layout that holds both apps is in
[fullstack-architecture.md](./fullstack-architecture.md).

The app is a Dude community: part Twitter, part forum, wrapped in a 3D world
that feels like The Big Lebowski. A yin-yang bowling ball rolls through
Venice beach, a bowling alley and the Mojave desert, and every page change is
a move through that world.

## Decisions

| Choice           | Pick                                                         | Why                                                                                 |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Framework        | Nuxt 4, Vue 3.5                                              | Server-rendered public pages, Nitro routes for the cookie, one hop to the API       |
| Why not Next.js  | It was the first pick                                        | Craig wants a second ecosystem to learn, not everything in Next. See Costs accepted |
| Language         | TypeScript, strict                                           | Same as the API                                                                     |
| Styling          | Scoped styles in `.vue` files + Motion for Vue               | Plain CSS per component, Motion for movement. No utility framework                  |
| 3D               | TresJS, Cientos, `@tresjs/rapier`, `@tresjs/post-processing` | The Vue renderer for three.js. Physics for the pins, bloom for the strike           |
| Server state     | TanStack Vue Query                                           | Infinite queries map onto `links.next`. `useFetch` alone does not page well         |
| World state      | Pinia                                                        | One small store for the camera target, ball state and quality tier                  |
| Forms            | `<form>` posting to Nitro routes with `$fetch`               | Field errors come straight from Nest's 400 body, passed through by Nitro            |
| Auth storage     | httpOnly cookie set by a Nitro route                         | Page scripts never see the JWT                                                      |
| Images and fonts | `@nuxt/image`, `@nuxt/fonts`                                 | Big photo backdrops need resizing and format conversion                             |
| Browser helpers  | VueUse                                                       | `useMediaQuery`, `useGeolocation`, `usePermission`, `useIntersectionObserver`       |
| Tests            | Vitest with `@nuxt/test-utils`, Playwright                   | Vitest matches the API. Playwright drives the real browser the canvas needs         |

## The one world

A single `<TresCanvas>` renders once, in `app/app.vue`, inside a component
named `World.vue`. It is `position: fixed` behind the DOM at `z-index: 0`,
and it is `aria-hidden`. Every page renders above it through `<NuxtPage>`
with a transparent background.

Text never lives in the canvas. The DOM is the source of truth for content,
links, forms and accessibility. The canvas is set dressing. If the canvas
fails to load, the app still works on a still photo.

### Stations

Each route group is a place in the world. The camera has a fixed pose at each
one.

| Route           | Place                                              | Backdrop                  |
| --------------- | -------------------------------------------------- | ------------------------- |
| `/`             | Venice boardwalk at dusk. The ball rolls into view | beach photo HDRI          |
| `/login`        | The alley front desk                               | alley interior            |
| `/signup`       | The shoe counter                                   | alley interior            |
| `/feed`         | The lanes, seen from the ball return               | neon alley, Star Lanes    |
| `/abidings/:id` | One lane, camera close on the pins                 | same                      |
| `/dudes/:id`    | A straight Mojave road, the narrator's country     | desert HDRI               |
| `/sphere`       | Earth from orbit. The Dudesphere itself            | globe texture, star field |
| `/admin/*`      | The pinsetter room behind the lanes                | machinery, work lights    |

### Realistic backgrounds

The backgrounds are photographs, not models. Each station uses an HDRI
environment map through Cientos' `<Environment>`, plus two or three large
photo planes at different depths for parallax when the camera moves. The
alley and the pins are the only modeled geometry.

Why: a modeled Los Angeles is months of work and still looks worse than a
photo. An HDRI gives real light and real reflections on the ball for free.

### The ball

A sphere with a yin-yang texture and a Rapier rigid body. It is the one
object that is always on screen. Between stations it rolls ahead of the
camera. At the lanes it rolls down a lane and knocks over ten pins, which are
Rapier bodies too. The strike is the app's reward animation.

## Page transitions in 3D

A route change becomes a camera move. The steps:

1. `World.vue` watches `useRoute().path` and writes the matching station to
   the Pinia store.
2. `useLoop().onBeforeRender` moves the camera along a spline from its
   current pose to the station's pose. The ball rolls ahead on the same path.
   The move takes 600 to 900 ms, eased out.
3. The outgoing and incoming page swap under the browser's View Transitions
   API, turned on with `experimental.viewTransition: true` in
   `nuxt.config.ts`. The DOM slides in sync with the camera instead of
   fading. Nuxt skips the transition on its own when the browser reports
   `prefers-reduced-motion: reduce`.
4. Under reduced motion the camera cuts instead of moving, the ball sits
   still, and the DOM swaps with a 150 ms opacity change through Vue's
   `<Transition>`.

Four moves carry the character of the app and get the most care:

- **Splash to login.** The ball rolls down the boardwalk and through the
  alley doors. The hero copy slides out to the left as the door frame
  passes.
- **Feed to thread.** The camera dives down one lane toward the pins. The
  feed list shrinks toward the chosen card, which grows into the thread
  header through a shared `view-transition-name`.
- **Posting an abiding.** The ball rolls, the pins fall, and a bloom pass
  flares the neon. The new card lands in the feed on the same beat.
- **Dude to sphere.** The camera lifts off the desert road, the horizon
  curves, and Earth fills the frame with the ball in orbit around it.

## Pages and flows

Every page names the API routes it calls. All of them are in
[overview.md](./overview.md) unless a line says "backend gap". The browser
never calls the API. A page calls a Nitro route under `server/api/`, and
Nitro calls the API with `$fetch` and the cookie's token.

### Splash `/`

Public. What a visitor sees first.

- Hero copy and two calls to action: "Roll in" to `/login`, "Sign up" to
  `/signup`.
- A ticker of recent public abidings from `GET /abidings?limit=10`.
- The live hashtag list from `GET /hashtags?limit=30`.
- Server-rendered with `useFetch`, and cached with
  `routeRules: { '/': { swr: 60 } }`.
- Scroll-driven parallax on the boardwalk photo planes through CSS
  `animation-timeline: scroll()`, so it costs no JavaScript.

### Sign up `/signup` and log in `/login`

- Sign up posts to `server/api/signup.post.ts`, which calls `POST /users`,
  then `POST /auth` with the same credentials, then sets the cookie.
- Log in posts to `server/api/session.post.ts`, which calls `POST /auth`.
- The token goes into a cookie named `session` through Nitro's `setCookie`:
  `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`, lifetime matching
  the JWT's expiry. `server/api/session.delete.ts` clears it for log out.
- Forms are plain `<form @submit.prevent>` with a `pending` ref. A 400 from
  Nest carries the field messages. Nitro passes the body through with
  `createError`, and the form shows each message under its input. No
  client-side validation library.
- `server/middleware/auth.ts` runs on every request. It reads the cookie,
  verifies the JWT with the same secret as the API, and puts
  `{ sub, username, role }` on `event.context.user`. It does not only
  decode.
- A server plugin copies `event.context.user` into `useState('me')` during
  SSR, so pages and route middleware know who is signed in without reading
  the httpOnly cookie, which they cannot.
- `app/middleware/auth.ts` is a route middleware. Pages opt in with
  `definePageMeta({ middleware: 'auth' })`: `/feed`, `/dudes/me`,
  `/sphere`, `/admin/*`. It sends anonymous visitors to `/login?next=`.
- Every Nitro route that changes data re-checks `event.context.user`
  itself. Route middleware guards pages, not API calls.

### Feed `/feed`

The logged-in home. This is the Twitter part.

- Newest first, from `GET /abidings`. Infinite scroll with
  `useInfiniteQuery` from TanStack Vue Query. `getNextPageParam` returns
  `links.next`, and the query stops when it is `null`. VueUse's
  `useIntersectionObserver` on the last card asks for the next page.
- Hashtag filter chips. Up to 10 at once, sent as
  `GET /abidings?hashtag=a,b`. `refDebounced` keeps typing in the chip
  search smooth while the list updates.
- Compose box. The mutation's `onMutate` adds the card the moment the user
  posts. On 201 the strike plays and the card settles. On an error
  `onError` rolls the cache back, the card slides out, and the message
  returns to the box.
- Reply from any card. A reply is `POST /abidings` with `replyToId`. It
  appears in the feed like any other abiding and links to its thread.
- Long feeds use `content-visibility: auto` on cards below the fold.

### Thread `/abidings/:id`

The forum part. One abiding and the conversation under it.

- The abiding from `GET /abidings/:id`, its author from `GET /users/:id` and
  `GET /profiles/user/:id`.
- Its replies, newest first. **Backend gap:** this needs
  `GET /abidings?replyToId=:id`, which does not exist yet.
- The feed stays mounted behind the thread through
  `<NuxtPage :keepalive="{ include: ['feed'] }">`, Vue's `<KeepAlive>`. Going
  back keeps the scroll position and makes no new request.
- The author avatar carries `view-transition-name: avatar-<id>` so it slides
  from the feed card into the thread header.

### Dude `/dudes/:id` and `/dudes/me`

A member's page.

- `GET /users/:id`, `GET /profiles/user/:id` and
  `GET /abidings?userId=:id`, paginated like the feed.
- `/dudes/me` adds edit forms that post to Nitro routes calling
  `PATCH /users/me` and `PATCH /profiles/me`, and a "Leave the sphere"
  button for `DELETE /users/me` with a confirm step.
- `isDude` and `ordainedDate` show as a badge: "Ordained 12 March 2024".
  Dates format through `@northguild/gmt`, never a `Date`.
- **Backend gap:** there is no lookup by username, so URLs carry the numeric
  id for now. `/dudes/walter` wants `GET /users/by-username/:username` or
  the same on profiles.

### The Sphere `/sphere`

A globe showing where the dudes are. The "dudes near you" feature lives here.

Location is **opt-in and off by default**. A member picks one of three
modes on `/dudes/me`:

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
  location". Never on page load. VueUse's `usePermission('geolocation')`
  tells the page whether to show the button or a "blocked in your browser"
  note, and `useGeolocation({ immediate: false })` waits for the click.
- A member can type a city instead of sharing GPS. The page geocodes it to
  the same coarse cell, so GPS is never required.
- An anonymous cell shows a dot only when it holds at least three members.
  Below that it shows nothing, so one anonymous dude in a small town is not
  one dot on their town.
- "Turn off" deletes the cell and label. It does not keep history.

What the page shows:

- The globe is a sphere with an Earth texture, a star field, and one dot per
  cell with a count. Dots pulse inside `onBeforeRender`. The ball orbits
  slowly.
- "Dudes near you" is a list beside the globe: named members in the
  viewer's cell and its eight neighbors, from `GET /dudes/nearby`. It is
  empty with a kind message when the viewer has location off.
- Clicking a dot flies the camera to it and filters the list to that cell.
- A member in `named` mode gets a small "near Venice, CA" line on their
  `/dudes/:id` page.

**Backend gaps:** all of it. The design is in the "Dude location" entry of
[overview.md](./overview.md) under "Deferred work". It lives in Postgres,
beside the profile, because the relation is keyed by `user.id`.

**Not a 4D world.** A fourth dimension here would mean a time axis, such as
scrubbing through where dudes were. That means storing location history,
which the privacy rules above forbid, and it adds nothing a member asked
for. The globe is a sphere. That is already the name on the door.

### Admin `/admin`

- `app/middleware/admin.ts` reads `useState('me').role`. Anyone who is not
  `admin` goes to `/feed`. Nest still enforces the role on every call, so
  the middleware is a convenience, not the guard.
- `/admin/users`: `GET /users` paginated, with soft delete
  (`DELETE /users/:id`) and restore (`POST /users/:id/restore`). Deleted
  rows show greyed with a restore button.
- `/admin/hashtags`: `GET /hashtags` plus hide (`DELETE /hashtags/:slug`)
  and restore (`POST /hashtags/:slug/restore`). Hidden tags need a list
  route that includes them. **Backend gap:** `GET /hashtags` returns live
  tags only.
- Plain tables, keyboard friendly. `<TransitionGroup>` animates rows in and
  out. The only 3D here is the pinsetter backdrop.

## Micro-animations

Motion for Vue handles movement in the DOM, and Vue's own `<Transition>` and
`<TransitionGroup>` cover enter and leave. The rules:

- 150 to 250 ms, ease-out. Nothing longer except the four signature 3D
  moves.
- Never block input. A button responds on press, not after its animation.
- Every animation has a reduced-motion branch, through VueUse's
  `useMediaQuery('(prefers-reduced-motion: reduce)')` or a CSS media query.
- Enter animations that need no JavaScript use CSS `@starting-style`.

Where they go: button press, card enter and leave, chip toggle, the
optimistic post sliding in, toasts, the admin table rows, and the avatar
shared element between feed and thread.

## Vue 3.5, Nuxt 4 and browser features

| Feature                             | Used for                                                                                    | Note                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `experimental.viewTransition`       | page swaps in sync with the camera, avatar shared element                                   | browser API. Nuxt skips it under reduced motion              |
| `<NuxtPage keepalive>`              | keep the feed alive behind a thread                                                         | Vue `<KeepAlive>`                                            |
| `useFetch`, `useAsyncData`          | server-rendered splash, thread and dude pages                                               | they call Nitro, which calls the API with the cookie's token |
| Nitro `server/api/*`                | sign up, log in, post, edit, admin actions, the API hop                                     | each route re-checks `event.context.user`                    |
| `server/middleware/auth.ts`         | verify the JWT once per request                                                             |                                                              |
| `definePageMeta({ middleware })`    | page guards                                                                                 |                                                              |
| `useState`                          | the signed-in member, shared SSR to client                                                  |                                                              |
| `routeRules` with `swr`             | cache the splash for 60 s                                                                   |                                                              |
| `useTemplateRef`                    | the canvas and the ball mesh                                                                | Vue 3.5                                                      |
| `defineModel`                       | the compose box and filter chips                                                            | Vue 3.4                                                      |
| `onWatcherCleanup`                  | tear down the camera spline when the route changes mid-move                                 | Vue 3.5                                                      |
| Vapor mode                          | optional. Compile the feed list without the virtual DOM                                     | Vue 3.6. Confirm it is stable and that TresJS allows it      |
| `<Suspense>`                        | DOM paints before the canvas assets arrive                                                  |                                                              |
| `useHead` preload links             | HDRIs and the ball texture for the next station                                             |                                                              |
| View Transitions API                | behind `experimental.viewTransition`                                                        | Chrome, Edge, Safari 18. Firefox falls back to a cut         |
| `prefers-reduced-motion`            | every animation's off switch                                                                |                                                              |
| `navigator.deviceMemory`            | pick the quality tier on first load, with `hardwareConcurrency`                             | Chromium only. Others get the medium tier                    |
| Geolocation API, Permissions API    | the Sphere's "Use my location" button                                                       | after a click only. Rounded on the device before sending     |
| CSS scroll-driven animations        | splash parallax                                                                             | Chrome, Edge, Safari 26. Firefox shows a still               |
| Popover API, CSS anchor positioning | menus and the compose box's emoji picker                                                    | anchor positioning is Chromium and Safari 26                 |
| `@starting-style`                   | CSS-only enter animations                                                                   |                                                              |
| Speculation Rules                   | prerender `/feed` while the visitor reads the splash                                        | Chromium only. Harmless elsewhere                            |
| `IntersectionObserver`              | infinite scroll trigger                                                                     | through VueUse                                               |
| `content-visibility: auto`          | long feeds                                                                                  |                                                              |
| WebGPU renderer                     | `WebGPURenderer` from `three/webgpu` through `TresCanvas`'s `renderer` prop, WebGL fallback | optional. Confirm stability when building                    |

## Performance and accessibility

- Three quality tiers, chosen on first load and changeable in settings:
  high (full HDRI, bloom, shadows), medium (smaller HDRI, no bloom, no
  shadows), still (a photo per station, no canvas at all).
- `<TresCanvas render-mode="on-demand">`. The canvas only renders during
  transitions, the strike, and pointer parallax. TresJS invalidates a frame
  on its own when a prop changes.
- Canvas assets load behind `<Suspense>`. The DOM paints first and the still
  photo shows until the HDRI arrives.
- Budgets: first paint under 1.5 s on a mid-range phone over 4G, under 6 MB
  of canvas assets across all stations, under 200 KB of JavaScript before
  the canvas chunk.
- `World.vue` is a `<ClientOnly>` component loaded with
  `defineAsyncComponent`, so it is a separate chunk and never renders on the
  server. Pages work without it.
- Every page works with keyboard alone. Focus order follows the DOM, which
  the canvas does not touch.
- Color contrast is checked against the photo backdrops. Cards carry a
  solid or frosted background so text never sits on a raw photo.

## Packages

| Package                      | Role                                    | Version to confirm     |
| ---------------------------- | --------------------------------------- | ---------------------- |
| `nuxt`                       | framework                               | 4.x                    |
| `vue`                        | UI                                      | 3.5, or 3.6 for Vapor  |
| `three`                      | 3D engine                               | latest                 |
| `@tresjs/core`               | Vue renderer for three                  | latest                 |
| `@tresjs/nuxt`               | the Nuxt module, devtools, GLSL imports | latest matching core   |
| `@tresjs/cientos`            | `<Environment>`, cameras, loaders       | latest matching core   |
| `@tresjs/rapier`             | physics for the ball and pins           | latest matching core   |
| `@tresjs/post-processing`    | bloom for the strike                    | latest matching core   |
| `motion-v`                   | DOM micro-animations, Motion for Vue    | latest                 |
| `@tanstack/vue-query`        | server state, infinite queries          | 5.x                    |
| `pinia`                      | world store                             | 3.x                    |
| `@vueuse/core`               | media query, geolocation, observers     | 13.x                   |
| `@nuxt/image`                | photo backdrops                         | latest                 |
| `@nuxt/fonts`                | fonts                                   | latest                 |
| `@northguild/gmt`            | dates                                   | same as the API        |
| `vitest`, `@nuxt/test-utils` | unit and component tests                | same Vitest as the API |
| `@playwright/test`           | browser flows                           | latest                 |

I checked Nuxt and TresJS in Context7 while writing this: the
`experimental.viewTransition` flag, `defineNuxtRouteMiddleware`,
`runtimeConfig`, the `@tresjs/nuxt` module, `useLoop`,
`render-mode="on-demand"`, the `@tresjs/post-processing` package and the
WebGPU renderer prop are all documented. I did not check `@tresjs/rapier`,
`motion-v` or Vapor mode. Check every version before `pnpm add`.

## Build order

Each phase ends with something a person can click through.

0. **Monorepo move.** See `fullstack-architecture.md`. Tests green.
1. **World shell.** `World.vue`, the Pinia store, the splash station with one
   HDRI, the ball rolling in. One transition: splash to login, with
   `experimental.viewTransition` and the reduced-motion branch.
2. **Auth.** Sign up, log in, log out, the cookie, the server and route
   middleware. An empty `/feed` behind it.
3. **Feed.** Infinite scroll, compose with an optimistic mutation, the
   strike.
4. **Threads, dudes, hashtags.** Needs the `replyToId` filter from the
   backend first.
5. **Admin.** Users and hashtags tables.
6. **The Sphere.** Needs the location endpoints from the backend first. The
   globe station, the three location modes on `/dudes/me`, dudes near you.
7. **Polish.** Quality tiers, budgets, Playwright on the four signature
   moves, a reduced-motion pass on every page.

## Backend gaps

Things the frontend needs that the API does not do yet. Each one is a small
backend change and should land before the phase that needs it.

| Gap                                     | Needed by       | Shape                                                          |
| --------------------------------------- | --------------- | -------------------------------------------------------------- |
| List replies to one abiding             | Thread, phase 4 | `GET /abidings?replyToId=:id`, same page shape                 |
| Look up a user or profile by username   | Dude, phase 4   | `GET /users/by-username/:username`                             |
| Reply count on an abiding               | Feed, phase 3   | `replyCount` on `AbidingResponseDto`, or a second call         |
| List hidden hashtags for the admin page | Admin, phase 5  | `GET /hashtags?includeDeleted=true`, admin only                |
| Set, change or clear my location        | Sphere, phase 6 | `PUT /profiles/me/location`, `DELETE /profiles/me/location`    |
| Dots for the globe                      | Sphere, phase 6 | `GET /sphere/cells`: cell and count, cells with 3 or more only |
| Dudes near a cell                       | Sphere, phase 6 | `GET /dudes/nearby?cell=`: named members in it and 8 neighbors |
| Image upload                            | later           | today `imageUrl` and `profileImageUrl` are plain URLs          |

The frontend takes a URL field for images until upload exists.

## Costs accepted

- **Nuxt over Next.js.** The Vue 3D ecosystem is smaller. For the ball, the
  pins and the globe there are about five React Three Fiber examples for
  every TresJS one, and `@tresjs/rapier` is younger than its React
  counterpart. Expect to read three.js source more often. The trade is a
  second ecosystem learned, and Vue's `<KeepAlive>`, `<Transition>` and
  fine-grained reactivity, which fit this app well.
- Every API call from the browser makes one extra hop through `apps/web`.
  The trade is no CORS and no token in page scripts.
- A 3D chunk ships on every page. The trade is one world and real 3D
  transitions. The still tier removes it for people who do not want it.
- The JWT is verified twice, once in Nitro and once in Nest. The trade is a
  redirect before the page renders instead of an error after.
- Photo backdrops are large. `@nuxt/image` and the quality tiers keep them
  inside the 6 MB budget.

## Deferred work

- **WebGPU.** three's WebGPU renderer is optional in the plan. Turn it on
  when it is stable and the WebGL fallback is proven.
- **Vapor mode.** Vue 3.6's no-virtual-DOM compile target. Try it on the
  feed list once TresJS confirms it works alongside.
- **Likes and follows.** Not in the backend. Following a tag is already
  designed in `overview.md`.
- **Location history or a time axis on the globe.** Ruled out, not
  deferred. See the Sphere section.
- **Distance in kilometers between two dudes.** Cells are too coarse for
  it, on purpose. "Near" means the same or a neighboring cell.
- **Trending tags.** Already deferred in `overview.md`.
- **Generated API types.** `packages/api-types` starts hand-written. See
  `fullstack-architecture.md`.
- **A native app.** Nothing here blocks one. The API is the contract.
