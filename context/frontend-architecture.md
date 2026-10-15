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

| Choice           | Pick                                                                                                                                            | Why                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework        | Next.js 16.4, React 19.3, App Router, Turbopack, Node runtime only                                                                              | Every rendering strategy in one framework, on the newest Next and React. Cache Components and React Compiler are on                                                                                                                                    |
| Why Next now     | Nuxt 4 was the plan until 2026-10-14                                                                                                            | Craig reversed it: the web app is now a lesson in Next's rendering strategies. The Nuxt plan was never built                                                                                                                                           |
| Language         | TypeScript, strict                                                                                                                              | Same as the API. The base options come from `packages/config/tsconfig.base.json`                                                                                                                                                                       |
| Styling          | CSS Modules, CSS variables in `src/styles/tokens.css`, `motion/react` for movement                                                              | Plain CSS per component, tokens for light and dark. No Tailwind                                                                                                                                                                                        |
| UI parts         | Shared parts in `components/ui/`, all native HTML today. Base UI (`@base-ui/react`) comes with the first part that needs real behaviour         | Each look written once. Base UI ships no styles, so our tokens drive it. FEED-16 adds it with Dialog. Rules in the `ui-composition` skill; chosen 2026-10-15 (`context/audits/frontend-audit.md`)                                                      |
| 3D               | React Three Fiber, `@react-three/drei`, `@react-three/rapier`, `@react-three/postprocessing`                                                    | After the MVP, as WORLD-48. The React renderer for three.js has the largest set of examples                                                                                                                                                            |
| Server state     | Server Components fetch on the server. TanStack Query 5 on the client                                                                           | Server Components render the first page. `useInfiniteQuery` pages on `links.next`. `refetchInterval` polls live games                                                                                                                                  |
| Global state     | None in the MVP. When it comes, zustand, with one store per request in a context provider                                                       | The URL, Server Components and the query cache hold everything the MVP needs. See "Client state shared by distant components" below                                                                                                                    |
| Forms            | `<form action={serverAction}>` with `useActionState`                                                                                            | Field errors come straight from Nest's 400 body. No zod and no form library. The form parts are native. Compared with React Hook Form and TanStack Form in `context/audits/forms-analysis.md`                                                          |
| Auth storage     | httpOnly cookies set by Next (the BFF)                                                                                                          | Page scripts never see a token. The browser never calls Nest. See "Auth as a BFF"                                                                                                                                                                      |
| Images and fonts | `next/image`, `next/font`                                                                                                                       | Resizing, modern formats and self-hosted fonts with no layout shift                                                                                                                                                                                    |
| Dates            | `@northguild/gmt`                                                                                                                               | The zero-`Date` rule covers `apps/web`. The root oxlint config enforces it                                                                                                                                                                             |
| Tests            | Vitest with `@testing-library/react` and `@testing-library/user-event` (never `fireEvent`), Playwright with `instant()` from `@next/playwright` | Vitest matches the API. `user-event` plays the whole chain of events a real click or keypress makes, and a lint rule blocks `fireEvent` (see `coding-standards.md`). Playwright drives the real browser that View Transitions and the lane canvas need |

## Client state shared by distant components

Form parts and small widgets keep their state with `useState`. WEB-54 added no state library.

zustand comes in with the first story whose client state several distant components share. That is likely the R3F world or Lane Night. The rule when it does:

- One store **per request**, made in a context provider, as zustand's Next.js guide says. Never a module-level store, because it would be shared by every request on the server.
- The provider is a Client Component placed as low in the tree as it can go.
- Server data still comes from Server Components. The store holds client-only state, not a copy of server data.
- Record the choice in the story that adds it, and update the "Global state" row above.

## Layout of `apps/web/src`

```text
apps/web/src/
  app/
    layout.tsx, layout.module.css, not-found.tsx, error.tsx, forbidden.tsx
                                             the root layout holds the skip link, SiteHeader, <main> and SiteFooter
    (public)/page.tsx                        splash (FEED-12's planned place; home is app/page.tsx today)
    (public)/login, signup                   AUTH-7 (static shell, client form)
    (public)/forgot-password, reset-password  AUTH-9
    (app)/feed/page.tsx                      AUTH-8 placeholder (FEED-13 replaces the body and adds loading.tsx)
    (app)/@modal/(.)abidings/[id]/page.tsx   intercepting route: the thread as a modal
    (app)/abidings/[id]/page.tsx             the thread as a full page
    (app)/dudes/[id], dudes/me
    (app)/lanes/..., abide/..., rug/..., laws/..., stranger, groups/..., nights/...
    (app)/admin/...
    lab/page.tsx                             the rendering-strategies index (WEB-11)
    api/auth/{logout,logout-everywhere}/route.ts   AUTH-7: plain form POSTs, 303 to /
    api/auth/refresh/route.ts                      AUTH-8: GET for proxy, POST for clientFetch
    api/bff/[...path]/route.ts               AUTH-8: client fetches, Bearer added on the server
    api/lanes/ticker/route.ts                SSE
    sitemap.ts, robots.ts, opengraph-image.tsx
  proxy.ts            AUTH-8: refreshes a session about to run out, before the page renders
  lib/api.ts          'server-only' typed fetch to Nest: apiFetch, ApiRequestError, maps 400 field errors
  lib/session.ts      'server-only', the Data Access Layer: cookie names and options, startSession,
                      clearSessionCookies, readSessionCookies, verifySession, getMe, requireSession
  lib/access-token.ts readTokenExp and expiresWithin. Pure, no 'server-only', so proxy.ts can import it
  lib/refresh.ts      'server-only': refreshOnce, one refresh per refresh token (AUTH-8)
  lib/bff-paths.ts    bffTarget and the allow-list for /api/bff. Pure
  lib/client-fetch.ts clientFetch: the browser's call to /api/bff, with one refresh and one retry on a 401
  lib/next-path.ts    safeNextPath: the same-origin check for ?next=, and loginHref
  lib/auth-rules.ts   the sign-up and sign-in field rules the two forms share (EMAIL_PATTERN, DTO limits)
  lib/cx.ts           the one class-name merger. No clsx or tailwind-merge
  lib/origin.ts       assertSameOrigin: the Origin check each /api/auth handler calls
  lib/route-responses.ts  'server-only': seeOther(path) (303 to a safe path), seeOtherToHome (= seeOther("/")), logFailure
  lib/actions/*.ts    Server Actions: auth.ts (signIn, signUp) with auth-state.ts (form state and
                      copy), theme.ts (sets the theme cookie)
  lib/theme.ts        theme cookie name and value check
  lib/motion.ts       motion/react presets that copy the --dur-* tokens
  components/ui/*     shared parts (Button, Text, Form, TextField, Stack, ToggleGroup...), each with a
                      .module.css and a spec. They know nothing about the app. Only these may import
                      @base-ui/react, which FEED-16 adds with Dialog
  components/SiteHeader  the banner in the root layout: "Dudesphere", linked to /. Static, reads no
                      request data. FEED-12 adds WhoIsSignedIn beside it. Scaffolding until WORLD-48
  components/*        feature components that compose the shared parts, each with a .module.css
                      for layout only. Auth: AuthForm, SignInForm, SignUpForm, NextPathField, CookieNote, SessionCorner.
                      FeedWelcome (AUTH-8) is the placeholder greeting on /feed
  styles/tokens.css   CSS variables, light and dark
  styles/globals.css  reset and base rules
  styles/motion.css   motion rules: .enter, reduced-motion View Transitions
```

Route groups such as `(public)` and `(app)` share a layout only. They do not
check auth. Each page, Server Action and Route Handler checks for itself.

`next.config.ts` turns on `cacheComponents`, `partialPrefetching` and
`reactCompiler`, and sets `experimental.agentFeedback: false`, so `next dev`
sends no anonymous feedback about how agents use Next. It has no
`transpilePackages`, `agentRules` or `agentUpgrade`. Earlier versions of this
file named all three. Fixed security headers come in WEB-45, through
`headers()`.

## Auth as a BFF

Next is the backend for the frontend (BFF). Nest stays bearer-only, with no
cookies and no CORS. The browser talks only to Next.

**Sign in.** The `signIn` Server Action in `lib/actions/auth.ts` calls Nest
`POST /auth/token` with `{ identifier, password }`. Nest answers
`{ accessToken, refreshToken, expiresIn }`. `startSession(pair, next)` in
`lib/session.ts` finishes every sign-in. It sets two cookies and returns the safe
place to land: `safeNextPath(next)`, or `/` when `next` is missing or unsafe. The
action then calls `redirect()` on that path. AUTH-52's email-link, passkey and
social handlers call `startSession()` too. There are no `api/auth/login` or
`api/auth/signup` handlers, because nothing would call them.

Both cookies are `httpOnly`, `secure: true` always (browsers accept it on
`http://localhost`) and `sameSite: 'lax'`. The `__Host-` and `__Secure-` prefixes
make a browser refuse a copy set without `Secure`:

- `__Host-session` holds the access token, with `path: '/'` and
  `maxAge: REFRESH_MAX_AGE_SECONDS` (604800, 7 days). The token inside still
  expires in 15 minutes, as Nest says in `expiresIn`. The cookie outlives it on
  purpose: `proxy.ts` cannot see the refresh cookie, so a session cookie that is
  present is how it tells a member whose token ran out from an anonymous
  visitor. See "Refresh". The `__Host-` prefix needs `path=/`, `Secure` and no
  `Domain`.
- `__Secure-refresh` holds the refresh token, with `path: '/api/auth'` and
  `maxAge` 604800 (7 days). Only the `/api/auth` handlers ever receive it. A
  refresh cookie at `/` would travel on every request, and parallel requests
  could race a single-use token.

Clearing sets each cookie to `""` at its own path with `maxAge: 0`, through
`clearSessionCookies()`. `cookies().delete(name)`, the name-only form, clears
only the cookie at `/`, so it could never clear the refresh cookie.
`delete({ name, path })` can clear another path. The app uses
`set(name, "", { path, maxAge: 0 })` instead, so every write has one shape.
`expires` takes a `Date`, so the code uses `maxAge`.

**Sign up.** The `signUp` Server Action calls Nest `POST /auth/sign-up`, then
runs the same sign-in step with `{ identifier: email, password }`. If sign-up
succeeds and the sign-in step fails, the member stays on `/signup` and sees "Your
account is ready, but we couldn't sign you in just now." with a "Sign in" link to
`/login` that carries `next`.

**The Origin check.** Next checks `Origin` on Server Actions only. A Route
Handler gets no check. Each `/api/auth` handler calls `assertSameOrigin()` in
`lib/origin.ts` itself. It is true only when the `Origin` header's host equals
`x-forwarded-host`, or else `host`. A missing Origin, or `"null"`, is false and
gets a 403 with no cookie touched. The check lives in each handler, not in
`proxy.ts`, because a matcher change can silently drop proxy coverage.

**The Data Access Layer.** `lib/session.ts` imports `server-only`, so a client
component cannot import it, and the build fails if one tries. AUTH-7 built the
cookie half: the names, the options, `startSession()`, `clearSessionCookies()` and
`readSessionCookies()`. AUTH-8 adds three functions.

- `verifySession()` reads the `__Host-session` cookie and decodes `exp` locally,
  with `readTokenExp()` from `lib/access-token.ts`. It does not verify the
  signature: Nest does that on every call. It returns `{ accessToken, exp }`, or
  `null` when the token is missing, malformed or already expired. It makes no
  network call. React's `cache()` wraps it, so it runs once per request.
- `getMe()` calls Nest `GET /users/me` with that token, also through `cache()`, so
  any number of components cost one call. It returns `null` when there is no
  session or Nest answers 401, and throws on any other failure, so an outage
  reaches the error boundary and never looks like "signed out". The token carries
  no role on purpose. The role comes from `getMe()`, because Nest reads it from
  the database on every request.
- `requireSession(next)` calls `verifySession()` and, when it is `null`,
  `redirect(loginHref(next))`. Pages for members only call it.

`verifySession()` and `requireSession()` authorize nothing. They read the cookie
and decode `exp`, so a forged or ended token passes them. Only data fetched from
Nest with the Bearer is protected, because Nest checks the signature and the
sign-in on every call. A page that shows member data must get it from Nest, and
send a 401 to `/login`.

`lib/access-token.ts` is pure and has no `server-only`, because `proxy.ts`
imports it too. Both files read the clock through `@northguild/gmt`.

`SessionCorner` and `/feed` use the layer. `SessionCorner` calls `verifySession()`,
not `readSessionCookies()`: with a 7-day session cookie, a present cookie no
longer means "signed in". `FeedWelcome` calls `requireSession("/feed")`, then
`getMe()`, and a `null` from `getMe()` (Nest answered 401) goes to
`/login?next=%2Ffeed` too. There is no loop: `/login` renders with that cookie,
because proxy sends only unreadable or nearly expired tokens to refresh. Layouts
never check auth. `cache()` shares results inside one render only, so nothing
leaks from one request to the next.

**Refresh.** `proxy.ts` runs on the Node runtime, before routing. Its rule is
short. For a GET whose `__Host-session` cookie is present and whose token is
inside its refresh window, already past `exp`, or unreadable, it redirects (307)
to `/api/auth/refresh?next=<path and query>`. Everything else passes through:

- **No cookie, or an empty one.** That is an anonymous visitor. A redirect would loop: refresh,
  then `/login`, then refresh again.
- **Any other method.** A Server Action POST passes through, and re-checks the
  session itself.
- **Prefetches.** Proxy cannot see the `next-router-prefetch` header: Next 16.4
  strips it from `request.headers`. So the matcher keeps prefetches out with
  `missing: [{ type: 'header', key: 'next-router-prefetch' }]`. That relies on
  partial prefetching being on: auto prefetches send `1` or `3`, and
  `<Link prefetch>` sends `2`. A Full prefetch sends no such header and would
  reach proxy. A prefetch never reaches proxy. A session page's prefetch stops at
  `io()` inside `verifySession`, so it holds no session output, and the click
  goes through proxy and refreshes. Only a page that reads no session is served
  whole from the prefetch.

The refresh window is `min(60, floor((exp - iat) / 2))` seconds before `exp`, or
60 when the token has no usable `iat`. A flat 60 seconds would loop for a token
that lives 60 seconds or less: the fresh token would already be inside the window,
and the handler's 303 would go straight back to refresh. Half the token's own life
means a token Nest just issued never needs a refresh. The cap assumes the web
server's clock and Nest's agree to within half the token's life, and a token that
lives 2 seconds or less can still loop. So `JWT_EXPIRES_IN` must be 3 or more.

Any GET counts, not only documents. A client-side `<Link>` navigation is an RSC
fetch with `Sec-Fetch-Dest: empty`, and a document-only rule would sign a member
out 15 minutes into a visit. The AUTH-8 Task 1 spike proved the chain in Chromium
and WebKit: proxy's 307, Next's own 307 adding `_rsc`, the handler's 303 with the
new cookie, then the page rendered client-side. `request.nextUrl` carries no
`_rsc`, so `next` is the page's own path and query. If `safeNextPath()` would
refuse that (a query over its 2048-character limit, say), proxy sends the path
alone. If that is refused too, it sends no `next`, and the handler lands on
`/feed`.

The matcher skips `/api`, `_next/static`, `_next/image`, `favicon.ico` and a fixed
list of static file extensions. It does not skip every path with a dot, because a
username may hold one: a future `/u/john.doe` must still reach proxy.
`proxy.spec.ts` pins the whole `config` word for word, because a matcher change
silently drops coverage.

Proxy is an optimistic step. It reads `exp` without checking the signature, so a
forged `exp` gets past it and fails at Nest. Every page, handler and action
re-checks.

The refresh handler is `app/api/auth/refresh/route.ts`. It reads the refresh
cookie, which only it can see, and calls Nest `POST /auth/token/refresh` through
`refreshOnce()`. GET serves proxy and navigation. POST serves `clientFetch`: it
checks Origin first (403, no cookie touched) and answers with a status only. It
needs `__Host-session`, like GET.
Every answer carries `Set-Cookie`, so every answer says `Cache-Control: no-store`.

Three rules guard the refresh cookie:

- **GET needs `__Host-session` first.** Proxy sends a navigation here only when
  that cookie is present, so a GET without it, or with an empty one, did not come
  from proxy. It can come from a cross-site link that carries a refresh cookie a
  sibling subdomain planted: `__Secure-` allows a `Domain` attribute and `__Host-`
  does not. Swapping that token would sign the browser in to the attacker's
  account. So that GET clears both cookies and goes to `/login?next=`, with no
  call to Nest. Only the cookie's presence counts, not its shape, because proxy
  sends a token it cannot read here too.
- **One refresh cookie only.** A request that carries `__Secure-refresh` twice is
  refused, because a planted copy can come last, and Next reads the last one. GET
  clears our cookies and goes to `/login?next=`. POST answers 401. Neither calls
  Nest. `hasDuplicateRefreshCookie(request)` in `lib/session.ts` makes the check
  from the raw `Cookie` header, because the cookie store cannot show a duplicate.
  The refresh handler and both sign-out routes share it.

- **Tie the refresh token to the session cookie's sign-in.** A single planted
  cookie, with the member's own gone (evicted, say), looks like any other. So the
  `sid` (the sign-in id) in the old `__Host-session` token must match the `sid`
  in the fresh access token (`sameSignIn()` in `lib/access-token.ts`). With no
  `sid` in the session cookie, Nest is not called at all. With no `sid` in the
  fresh token, or a different one, nothing is saved, both cookies are cleared and
  the member counts as signed out (SEC-6). A pair held for 10 seconds is keyed by
  the refresh token alone, so every request is checked against its own session
  cookie.

POST follows the same rules, behind its Origin check. Without `__Host-session`,
or with an empty one, it clears both cookies and answers 401, with no call to
Nest. Otherwise a planted refresh cookie, with no session cookie, would sign a
visitor in to the attacker's account the first time a page called `clientFetch`.

| Outcome                                                                                                                                                                     | Cookies                                           | GET                                                                      | POST |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| Nest answers with a new pair                                                                                                                                                | `startSession()` sets both                        | 303 to the safe `next`, or `/feed`                                       | 204  |
| No refresh cookie, a duplicate refresh cookie, no `__Host-session`, no `sid` in the session cookie or the new token, a fresh pair from another sign-in, or Nest answers 401 | both cleared                                      | 303 to `/login?next=<next>`, or plain `/login` for `/login` or `/signup` | 401  |
| Nest answers 5xx or 429, does not answer, or any other error                                                                                                                | `__Host-session` cleared; `__Secure-refresh` kept | 303 to the safe `next`, or `/feed`                                       | 503  |

- A 401 means this sign-in is over. It is no failure of the app, so it is not
  logged. The other failures go through `logFailure()`, which never writes a
  token or Nest's body.
- Nest down keeps the refresh cookie, because the token was not spent. Clearing
  the session cookie stops proxy from redirecting the same request again. The
  page then renders signed out, or `requireSession()` sends the member to
  `/login`.
- `next=https://evil.example.com`, or no `next`, lands on `/feed`. `/feed` is the
  fallback because a refresh is a signed-in act.
- Every failure clears `__Host-session`, so nothing can loop while the browser
  accepts the cookie writes. A browser that refuses them would redirect again and
  again until it gives up, after 16 to 20 redirects. The handler cannot tell that
  browser from a second tab that lost the race, and the only stateless loop
  breaker would put a marker in the address bar, so this is accepted (QA-2).
- An intended change: a malformed or unreadable session cookie with a live refresh
  cookie now lands signed out, because there is no `sid` to tie the refresh token
  to.
- **Accepted limit (QA-4).** On the Nest-down path the kept refresh cookie is never
  used or revoked, so the old sign-in stays live at Nest until it expires, up to
  7 days.

**One refresh at a time.** A refresh token works once, and Nest ends the whole
sign-in if one is used twice, with no grace period. `lib/refresh.ts` keeps a
module-level `Map` from the SHA-256 hex of the refresh token (never the token
itself) to its promise, so callers that arrive together share one call to Nest.

The settled pair stays in the Map for 10 seconds (`SETTLED_PAIR_HOLD_MS`). A
second tab can arrive a few milliseconds after the first finished, still holding
the old cookie. If the entry went the moment Nest answered, that tab would send
the spent token and end the sign-in for both tabs. A failure is dropped at once.

The accepted cost: someone who replays the old token on the same instance within
those 10 seconds also gets the new pair. The Map lives in one server instance, so
two instances can still race. The loser gets 401 "reused" and signs in again.

**Client fetches.** Client components call `clientFetch(path, init)` in
`lib/client-fetch.ts`. It calls `/api/bff/<path>`, a Route Handler that adds the
Bearer from the `__Host-session` cookie and calls Nest. The browser never calls
Nest and never sees a token.

On a 401, `clientFetch` posts to `/api/auth/refresh` once, with one promise shared
by the whole tab, and retries the request once. A 401 after the retry, or a 401
from the refresh, sends the browser to `/login?next=<current path and query>`. A
503 from the refresh means Nest is down: the caller gets the original 401, with no
redirect. After the Nest-down path the session cookie is gone but the refresh
cookie is kept, and POST refuses to refresh without the session cookie. So a
`clientFetch` 401 there goes to `/login`, where a reload also recovers. That is
part of the accepted QA-4 limit. It refuses a path that is empty, absolute, holds
a backslash, or has an empty, `.` or `..` segment (encoded or not), and a `ReadableStream` body, because
the body may need to be sent twice.

The `/api/bff` handler never refreshes. It guards each request, in this order:

1. **Path.** `bffTarget()` in `lib/bff-paths.ts` allows `abidings`, `hashtags`,
   `profiles` and `users/me`, matched segment by segment, so `users/me-x` and
   `users/1` fail. An empty, `.` or `..` segment, or a segment holding `/`, `\`
   or `%`, fails too. A failure answers 404. `lanes` waits for LANE-25.
2. **Origin.** POST, PATCH and DELETE call `assertSameOrigin()`, and a failure
   answers 403.
3. **Session.** `verifySession()` is `null`: 401, with no call to Nest.
4. **Headers.** Only the method, the query string, `Content-Type` and the body go
   to Nest, with the Bearer. Only the status, `Content-Type`, `Retry-After` and
   the body come back, with `Cache-Control: no-store` and
   `X-Content-Type-Options: nosniff`, so a browser never reads a body as another
   type. The browser's Cookie and
   Authorization never go on. No answer from Nest gives 502.

`X-Bff-Secret` and `X-Client-Ip` are not sent yet. Nest reads neither until
API-10, which adds both headers to every BFF call, `/api/bff` included, from one
helper. Until then Nest counts every BFF call under the Next server's address, so
one visitor can use up the shared rate-limit bucket (SEC-3, accepted, API-10's
scope).

**Sign out.** Sign out cannot be a Server Action. An action posts to the
page's own path, so the `__Secure-refresh` cookie, limited to `/api/auth`, never
reaches it. The corner on `/` (`SessionCorner`) holds two plain
`<form method="post">` buttons that post to Route Handlers:

- "Sign out" posts to `/api/auth/logout`. It signs out with the access token
  first, through Nest `POST /auth/sign-out`, which ends the whole sign-in, refresh
  family included. So it no longer calls `/auth/token/revoke`. Only if Nest
  answers 401 to that token (usually because it is out of date) does it fall back
  to the refresh token, and only with one refresh cookie and a `sid` in the
  session cookie. It swaps the token once, checks the fresh pair has the same
  `sid`, and signs out with the fresh access token, which it never saves. Any
  failure lands on `/?signout=partial`.
- "Sign out everywhere" posts to `/api/auth/logout-everywhere`. It calls
  `POST /auth/sign-out-everywhere` with the access token. If Nest answers 401 to
  that token, and there is a usable access token with a `sid` and one refresh
  cookie, it swaps the refresh token through `POST /auth/token/refresh`, checks
  the `sid` of the fresh pair, and tries once more. With no usable access token
  it makes no refresh call. On a `sid` mismatch it lands on partial and revokes
  nothing. It never calls `/auth/token/revoke`. When sign-out
  everywhere fails, it tries `POST /auth/sign-out` once with the newest access
  token it can tie to this sign-in that Nest did not refuse: the session's own
  token after a failure that was not a 401, or the `sid`-matched fresh token after
  a refresh. It never tries after a 401. Either way it lands on
  `/?signout=partial`, so the member learns other devices may still be signed in.
  The corner on `/` then says the sign-out may not be complete, and tells the
  member what to do. If
  this sign-in had already ended at Nest, it redirects to `/?signout=ended`, and
  the corner says: "This sign-in had already ended, so you're signed out here. To
  be sure your other devices are signed out, sign in and press Sign out
  everywhere."

**The shared rule.** A refresh token goes to Nest only when it can be tied to the
session cookie's sign-in: it is sent once, the session token has a `sid`, and the
fresh pair has the same `sid`. A subdomain can plant `__Secure-refresh` but not
`__Host-session`, so the session cookie is the one input the member can be sure
of. The refresh route and both sign-out routes follow it.

A request that sends the refresh cookie twice is the plainest case. Next reads the
planted one and the app cannot clear it, so no call uses the refresh token. Each
route checks with `hasDuplicateRefreshCookie()` after its Origin check:

- "Sign out" signs out with the access token alone. It lands on `/` on success and
  on `/?signout=partial` otherwise.
- "Sign out everywhere" calls `/auth/sign-out-everywhere` with the access token
  only, and only when `__Host-session` holds one. It lands on `/` on success and
  on `/?signout=partial` otherwise.

Each handler exports `POST` only, checks Origin, clears both cookies, and answers
303 to `/`, or to `/?signout=partial` (either route) or `/?signout=ended` (sign out
everywhere). A Nest failure never stops the clearing. Nest ends the
sign-in, access tokens included, because every access token carries the
sign-in's id (`sid`). Clearing the cookies still matters: dead tokens left in
them would cost a 401 and a failed refresh on the next page. `seeOther(path)`
and `logFailure()` in `lib/route-responses.ts` hold the parts the handlers share.

Signing in again also ends the previous sign-in. `signIn` and `signUp` call Nest
`POST /auth/sign-out` (bearer) with the old access cookie, after a successful
`/auth/token` and before they set the new cookies. That route ends only the
current sign-in. It needs a live old access token. Since AUTH-8, proxy refreshes
the token before `/login` renders, so a member who signs in again after 15 minutes
still has one.

**Where auth is checked.** Every page, Server Action and Route Handler re-checks the
session itself, through the Data Access Layer. Layouts never check auth, because a
layout does not re-render on every navigation. Proxy's check is only a first
step. With Cache Components on, `cookies()` is read only inside a `<Suspense>`
boundary and never inside `'use cache'`.

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
with the Bearer from the `__Host-session` cookie.

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
  (`SignInForm`, `SignUpForm`) that uses `useActionState` with a Server Action in
  `lib/actions/auth.ts`. The form sits in the static shell, never in a Suspense
  hole, because a hole shows only its fallback with JavaScript off. `NextPathField`
  reads `?next=` through `useSearchParams()` inside its own
  `<Suspense fallback={null}>` and writes a hidden `next` input. With JavaScript
  off there is no `next`, and sign-in lands on `/`. `reset-password` reads
  `searchParams`, which is async, inside `<Suspense>`.
- Settled in AUTH-7: password sign-in and sign-up are Server Actions. There are
  no `api/auth/login` or `api/auth/signup` handlers. Both actions finish with
  `startSession()`, as the "Auth as a BFF" section describes. Only sign out uses
  Route Handlers.
- Sign up calls `POST /auth/sign-up`, then `POST /auth/token` with the same
  credentials, then `startSession()`.
- Log in calls `POST /auth/token`.
- `/login` and `/signup` always show their forms. A signed-in visitor is not
  bounced, because a `__Host-session` cookie can look alive for up to 7 days after
  Nest ended the sign-in. Success lands on `/`, or on a safe `next`.
- The login form has one input labelled "Email" (`type="email"`,
  `autocomplete="username"`) and a password. It posts `{ identifier, password }`,
  so the API still takes an email or a username. AUTH-52 builds on that label and
  decides whether usernames go for good.
- The forms carry native constraints that copy Nest's DTO rules: `required`,
  `type="email"`, `minlength`, `maxlength`, and a username `pattern` with no `@`
  or spaces. The login password has no length rules, so older passwords still
  work. Nest still decides. With JavaScript off, an error response shows a blank
  page. See "Known limit" in `rendering-strategies.md`.
- Both pages end with a one-line cookie note (`CookieNote`). No banner: the
  session, refresh and theme cookies are strictly necessary or set at the
  member's request. WEB-53 holds the full notice.
- The sign up form asks for email, display name, username and password, in that
  order. It says a username cannot hold `@` or spaces, and that it is private. The
  API answers 400 for one that does.
- The sign up form also asks for a display name, and says that it is the name
  other members see. It posts `profile: { displayName }`. The API answers 409 `DISPLAY_NAME_TAKEN` for a
  name in use, in any letter case, and the form shows that under the input.
- AUTH-9 adds "Forgot password?" to the login page (AUTH-7 leaves it out, because
  the page does not exist yet). The link opens `/forgot-password`: one email input.
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
| `/sphere`        | Earth from orbit. Dudesphere itself                | globe texture, star field |
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
| `proxy.ts`                                | refresh the session before a page renders, on any navigation                | Node runtime. Replaces `middleware.ts`                   |
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
| `@testing-library/user-event` | acting as the member in component tests      | 14.x                                 |
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
