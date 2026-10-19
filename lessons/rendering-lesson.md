# Rendering: the lessons

This file teaches how Next.js 16.4 makes a page's HTML in Dudesphere, and how long it keeps it. Each entry comes from one story, in the order the stories were built, so the file reads as a course from top to bottom. Every step names the file and the function to open. The full table of strategies is in [rendering-strategies.md](../context/epic-lebowski/rendering-strategies.md).

## Contents

- [AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies](#auth-7-bff-sign-up-sign-in-and-sign-out-with-httponly-cookies): A visitor can now sign up at `/signup` and sign in at `/login`, and both forms work with JavaScript off.
- [AUTH-8: proxy.ts refresh and the Data Access Layer](#auth-8-proxyts-refresh-and-the-data-access-layer): A member's session now refreshes before a page renders, whether they load the page or click a link inside the app.
- [AUTH-9: Forgot and reset password pages](#auth-9-forgot-and-reset-password-pages): A member who forgot their password can now ask for a link at `/forgot-password` and set a new password at `/reset-password`.
- [WEB-11: Rendering strategies guide and the /lab page](#web-11-rendering-strategies-guide-and-the-lab-page): An admin can now open `/lab`, the Rendering lab, and see every rendering strategy the app teaches, with the routes that use each one.

## AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies

[#41](https://github.com/craig-o-curtis/dudesphere/issues/41) · 2026-10-15 · Static shell with a client form, and Streaming dynamic

**TLDR.** A visitor can now sign up at `/signup` and sign in at `/login`, and both forms work with JavaScript off. The idea: a page stays static when only its request-time reads go into small `<Suspense>` holes, the parts of a page that wait for the request. The form itself stays in the static shell, the HTML that `next build` makes once, so it is in the page before any script runs. With JavaScript off, a hole shows only its fallback, so a form in a hole would vanish.

### How it works here

1. `apps/web/src/app/(public)/login/page.tsx` → `LoginPage`: a synchronous Server Component with no request-time reads. `next build` prerenders it and lists the route as `◐ /login` (a partial prerender: a static shell with holes).
2. `apps/web/src/components/SignInForm/SignInForm.tsx` → `SignInForm`: a `'use client'` component. "Client" means it also runs in the browser. Next still renders it to HTML at build, so the labels, inputs, button and `CookieNote` are all in the shell.
3. `apps/web/src/components/NextPathField/NextPathField.tsx` → `NextPathField`: reads `useSearchParams()` for `?next=`. The query string is unknown at build, so `SignInForm` wraps it in `<Suspense fallback={null}>`. Only this one hidden input waits. Without the boundary, `next build` fails (Next docs, `useSearchParams`).
4. The member presses "Sign in". `useActionState(signIn, initialAuthFormState)` gave the form its `action`. A Server Action posts to the page's own path, `/login`. With JavaScript on, React sends it as a fetch and sets `pending`, so the button reads "Signing in…". With JavaScript off, the browser posts the form itself.
5. `apps/web/src/lib/actions/auth.ts` → `signIn`: on success it calls `startSession()` and then `redirect(target)`. With JavaScript on, that is a client-side navigation. With JavaScript off, Next answers 303 See Other, and the browser follows it with a GET to `/`.
6. On failure `signIn` returns `{ fieldErrors, formError, values }`. With JavaScript on, `useActionState` hands that to `SignInForm`, which shows each error under its input, and `apps/web/src/hooks/useFocusFirstInvalid.ts` → `useFocusFirstInvalid` moves focus to the first bad input. With JavaScript off the page is blank. That is a Next bug; see Watch out.
7. `apps/web/src/app/page.tsx` → `Home`: also synchronous. It passes its `searchParams` promise, unread, to `SessionCorner`, inside `<Suspense fallback={<SessionCornerSkeleton />}>`. The heading and tagline go in the shell.
8. `apps/web/src/components/SessionCorner/SessionCorner.tsx` → `SessionCorner`: an async Server Component. It awaits `readSessionCookies()` and `searchParams` together, then streams in the signed-in forms or the signed-out links. React sends a streamed hole with a small inline script that swaps it in. With JavaScript off that script never runs, so the visitor keeps `SessionCornerSkeleton`, the signed-out links. The story accepts this.

### Look-alikes

|                     | The static shell                                  | A `<Suspense>` hole                                                 |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| What it is          | HTML made once, at `next build`, the same for all | A part that waits for the request, and streams in later             |
| When to use it      | Anything that doesn't depend on who is asking     | Anything that reads cookies, the query string or other request data |
| With JavaScript off | Shown, and a form in it still posts               | Only the fallback shows                                             |
| In this app         | `LoginPage` with `SignInForm`; `Home`'s heading   | `NextPathField` in `SignInForm`; `SessionCorner` in `Home`          |

|                | `useSearchParams()`                                      | The page's `searchParams` prop                                    |
| -------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| What it is     | A client hook that reads the query string in the browser | A promise the page receives on the server                         |
| When to use it | A client component needs a query value                   | A Server Component needs one, together with other server reads    |
| In this app    | `NextPathField.tsx` → `NextPathField`, for `?next=`      | `page.tsx` → `Home` passes it to `SessionCorner`, for `?signout=` |

### The code

```tsx
// EXISTING FILE: apps/web/src/app/page.tsx
export default function Home({ searchParams }: { searchParams: Promise<SignoutParams> }) {
  return (
    <section className={styles.main}>
      <h1 className={styles.title}>The Dudesphere</h1>
      <p className={styles.tagline}>The Dude abides. The lanes open soon.</p>
      <p className={styles.note}>{FRAMES_PER_GAME} frames, no hurry. Take it easy, man.</p>
      <Suspense fallback={<SessionCornerSkeleton />}>
        <SessionCorner searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
```

```tsx
// NEW FILE: apps/web/src/components/NextPathField/NextPathField.tsx
export function NextPathField() {
  const next = useSearchParams().get("next");
  if (!next) return null;
  return <input type="hidden" name="next" value={next} />;
}
```

`Home` never awaits `searchParams`. It hands the promise to the hole, so the page itself has no request-time read and stays in the shell. `NextPathField` is as small as a hole can be: with JavaScript off it renders nothing, there is no `next`, and sign-in lands on `/`.

### Watch out

- **Never put a form inside a hole.** With JavaScript off, a hole shows only its fallback, so the form would vanish. Only the request-time read goes in the hole. Here that is the hidden `next` input, with `fallback={null}`.
- **A JavaScript-off error shows a blank page.** With `cacheComponents` on, Next 16.4 answers a Server Action POST that returns state, rather than redirecting, with flight data (the data React uses to update a page) and no HTML. The 303 on success works. The Task 1 spike found it before the forms were built. Next tracks it as [vercel/next.js#99756](https://github.com/vercel/next.js/issues/99756), with a fix in review in [PR #99981](https://github.com/vercel/next.js/pull/99981). The forms copy Nest's rules into `required`, `type="email"`, `minlength`, `maxlength` and `pattern`, so the browser stops most bad values before they post. `apps/web/e2e/auth.spec.ts` pins the bug in a test named "KNOWN BUG", which fails once Next fixes it.
- **Call `redirect()` outside `try`.** It throws to do its work, so a `catch` around it would swallow the redirect. `signIn` and `signUp` call it on the last line, after their `try` blocks.

### Read more

- [Forms with Server Actions and `useActionState`](https://nextjs.org/docs/app/guides/forms)
- [`useSearchParams` and prerendering](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- [`redirect`: 303 for a form posted without JavaScript](https://nextjs.org/docs/app/api-reference/functions/redirect)
- [`useActionState`, React docs](https://react.dev/reference/react/useActionState)
- [rendering-strategies.md: Known limit, JavaScript-off Server Action errors](../context/epic-lebowski/rendering-strategies.md#known-limit-javascript-off-server-action-errors)
- The auth side of this story: [auth-lesson.md, AUTH-7](./auth-lesson.md#auth-7-bff-sign-up-sign-in-and-sign-out-with-httponly-cookies)

## AUTH-8: proxy.ts refresh and the Data Access Layer

[#42](https://github.com/craig-o-curtis/dudesphere/issues/42) · 2026-10-15 · `proxy.ts`, Data Access Layer, and Streaming dynamic

**TLDR.** A member's session now refreshes before a page renders, whether they load the page or click a link inside the app. The idea: `proxy.ts` runs on the server before routing, for every request its matcher lets in, so it can send a navigation through a Route Handler that sets fresh cookies and back, while every page stays a static shell. Inside the page, one `<Suspense>` hole asks who is signed in through the Data Access Layer (DAL): one cached, server-only module that every page, action and handler asks.

### How it works here

A member whose access token runs out in 20 seconds clicks a `<Link>` to `/feed`.

1. **The prefetch, earlier.** When the link appeared, the router prefetched `/feed`. Every prefetch sends a `next-router-prefetch` header, and the `missing` rule in `apps/web/src/proxy.ts` → `config` keeps any request with that header out of proxy. So a hovered link never starts a refresh. The prefetch holds no session output either, because `verifySession` stops at `await io()` (step 6).
2. **The click.** The router fetches `/feed` as an RSC request: it asks for the data React uses to render the page on the client, not for HTML. Next strips its RSC headers from the request proxy sees, so that proxy treats an RSC request and an HTML request the same. `proxy.ts` → `proxy` runs before Next picks a route. For a GET with `__Host-session` whose token is inside its refresh window, it answers 307 to `/api/auth/refresh?next=/feed`. `nextPathFor` builds `next` from `request.nextUrl`, which never carries Next's internal `_rsc` query.
3. **The round trip.** The router follows the 307. `apps/web/src/app/api/auth/refresh/route.ts` → `GET` swaps the tokens, sets both cookies and answers 303 to `/feed`. The router follows that too, and renders `/feed` on the client with no full reload. The Task 1 spike proved this chain in Chromium and WebKit, on a production build, before proxy was written. The auth side of this step is in [auth-lesson.md, AUTH-8](./auth-lesson.md#auth-8-proxyts-refresh-and-the-data-access-layer).
4. **The shell.** `apps/web/src/app/(app)/feed/page.tsx` → `FeedPage` is synchronous and reads nothing from the request. Its heading is in the static shell, and `next build` lists the route as `◐ /feed`. `apps/web/src/components/SiteHeader/SiteHeader.tsx` → `SiteHeader`, new in the root layout, reads nothing either, so every page stays `◐`.
5. **The hole.** `apps/web/src/components/FeedWelcome/FeedWelcome.tsx` → `FeedWelcome` sits in `<Suspense fallback={<FeedWelcomeSkeleton />}>`. It awaits `requireSession("/feed")` and then `getMe()`, both from `apps/web/src/lib/session.ts`, and streams in "Signed in as …".
6. **The DAL.** `session.ts` → `verifySession` reads the cookie through `cookies()`, decodes `exp`, awaits `io()` from `next/cache`, and only then compares `exp` with gmt's clock. React's `cache()` wraps it, so `requireSession` and `getMe` share one run per render. `getMe` is wrapped too, so any number of components that ask make one call to Nest's `GET /users/me`. `import "server-only"` on the file's first line makes the build fail if a Client Component imports it.

### Look-alikes

|                         | `proxy.ts`                                                         | A Route Handler                                                 |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| What it is              | Code that runs before routing, on every request its matcher admits | A `route.ts` file that answers HTTP at its own path             |
| Runs on                 | Node only. `runtime` can't be set; setting it throws               | Node, the default                                               |
| Sees `__Secure-refresh` | No: it runs for page paths, and that cookie's path is `/api/auth`  | Yes, when it lives under `/api/auth`                            |
| When to use it          | A quick check on cookie data alone, then a redirect                | Work that needs a body, a call to Nest or a path-limited cookie |
| In this app             | `proxy.ts` → `proxy`                                               | `refresh/route.ts` → `GET`, `POST`; `bff/[...path]/route.ts`    |

`proxy.ts` replaces `middleware.ts`, which Next 16 deprecated. Proxy runs on Node and can't use the Edge runtime. This app has no `middleware.ts`.

|                         | React `cache()`                                             | `'use cache'`                                                       |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| What it is              | A wrapper that remembers a function's result for one render | A directive that keeps a function's or component's output for reuse |
| How long it keeps it    | One server request. React starts afresh on the next         | Until its `cacheLife` runs out, or a tag expires it                 |
| Can it read `cookies()` | Yes                                                         | No. A plain `'use cache'` throws on `cookies()`                     |
| In this app             | `session.ts` → `verifySession`, `getMe`                     | Not used in this story                                              |

### The code

```ts
// NEW FILE: apps/web/src/proxy.ts
export function proxy(request: NextRequest): NextResponse {
  if (request.method !== "GET") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !needsRefresh(token)) {
    return NextResponse.next();
  }

  // Next strips its internal `_rsc` query from nextUrl, so this is only the
  // page's own path and query (proved in the Task 1 spike).
  const next = nextPathFor(request.nextUrl.pathname, request.nextUrl.search);
  const target = new URL(REFRESH_PATH, request.url);
  if (next !== null) {
    target.searchParams.set("next", next);
  }
  return NextResponse.redirect(target, 307);
}
```

```ts
// EXISTING FILE: apps/web/src/lib/session.ts
export const verifySession = cache(async function verifySession(): Promise<VerifiedSession | null> {
  const { accessToken } = await readSessionCookies();
  if (accessToken === null) {
    return null;
  }

  const exp = readTokenExp(accessToken);
  if (exp === null) {
    return null;
  }

  await io();
  if (expiresWithin(exp, 0)) {
    return null;
  }

  return { accessToken, exp };
});
```

`proxy` decides on cookie data alone and makes no network call. The Next docs call this an optimistic check: fast, and never the last word. A Server Action POST passes straight through, and every page, handler and action checks the session again. `proxy.ts` copies `SESSION_COOKIE` rather than import it from `session.ts`, because that file pulls in `server-only`, `next/headers` and the API client, and the proxy docs advise against shared modules there. `proxy.spec.ts` fails if the two names drift apart.

### Watch out

- **The `missing` rule works only while every prefetch sends the header.** Proxy can't spot a prefetch itself, because Next strips `next-router-prefetch` from `request.headers`. So the matcher has to. Auto prefetches and `<Link prefetch={true}>` send the header while `partialPrefetching` is on in `apps/web/next.config.ts`. A Full prefetch sends none, so it would reach proxy and could start a refresh. The proxy docs also warn that a matcher change silently drops coverage, so `apps/web/src/proxy.spec.ts` pins `config` word for word.
- **Read the clock after `io()`, not just after `cookies()`.** The `io()` docs say a component that reads `cookies()` doesn't need `io()`, because the cookie read is already where a prerender stops. Here that wasn't enough. With partial prefetching, session data resolves in the App Shell, the per-session prefetch Next makes ahead of a navigation. So `cookies()` resolved there, and gmt's clock was read during a prerender. The Task 9 e2e run caught Next logging "encountered the unstable value Date.now() while prerendering". `verifySession` now awaits `io()` before the clock: a control build logged 8 of those lines, and the fixed build none. The docs prefer `io()` to `connection()`, which would also block prefetches.
- **`cache()` dedupes inside a render only.** In a Route Handler or a Server Action it does nothing, and every call runs the function (Next docs, "Creating a Data Access Layer"). Vitest has no server render either. So the claim that three `getMe()` calls make one Nest call was checked by counting calls in the API log, not by a unit test.

### Read more

- [`proxy.js` API reference: matcher, runtime and execution order](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [`proxy.js`: RSC requests and rewrites](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#rsc-requests-and-rewrites)
- [`io()`, and how it differs from `connection()`](https://nextjs.org/docs/app/api-reference/functions/io)
- [Optimizing prefetching: include session data in the shell](https://nextjs.org/docs/app/guides/optimizing-prefetching#include-session-data-in-the-shell)
- [Authentication: creating a Data Access Layer](https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal)
- [Authentication with Cache Components](https://nextjs.org/docs/app/guides/authentication-with-cache-components)
- [Server and Client Components: preventing environment poisoning (`server-only`)](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)
- [`cache`, React docs](https://react.dev/reference/react/cache)
- [rendering-strategies.md: the `proxy.ts`, Route Handlers, Data Access Layer and Streaming dynamic rows](../context/epic-lebowski/rendering-strategies.md#the-strategies)
- The auth side of this story: [auth-lesson.md, AUTH-8](./auth-lesson.md#auth-8-proxyts-refresh-and-the-data-access-layer)

## AUTH-9: Forgot and reset password pages

[#43](https://github.com/craig-o-curtis/dudesphere/issues/43) · 2026-10-16 · Static shell with a client form, and Server Actions

**TLDR.** A member who forgot their password can now ask for a link at `/forgot-password` and set a new password at `/reset-password`. The idea: a form that needs a value from the URL before it can render must sit in a `<Suspense>` hole, a part of the page that waits for the request, and a hole shows only after React's inline script swaps it in. So the reset form needs JavaScript, and the hole's fallback in the static shell says so in a `<noscript>` line. The forgot form reads nothing from the request, so it stays in the shell and works with JavaScript off.

### How it works here

A member asks for a link, opens it from the email and sets a new password.

1. `apps/web/src/app/(public)/forgot-password/page.tsx` → `ForgotPasswordPage`: synchronous, with no request-time reads, so `ForgotPasswordForm` is in the static shell. This is the AUTH-7 pattern.
2. `apps/web/src/lib/actions/password.ts` → `requestReset`: on Nest's 202 it calls `redirect("/forgot-password/sent")`. With JavaScript off that is a 303. Success never returns state, so it never hits the blank page that a state-returning Server Action gets with JavaScript off (AUTH-7, Watch out). `apps/web/src/app/(public)/forgot-password/sent/page.tsx` → `ForgotPasswordSentPage` shows the same copy whether or not the address has an account.
3. The member opens `/reset-password?token=…`. `apps/web/src/proxy.ts` → `proxy` finds the path in `NO_SESSION_PATHS` and passes it through. A refresh redirect there could land on `/login?next=…`, with the token inside `next`.
4. `apps/web/next.config.ts` → `headers()` adds `Referrer-Policy: strict-origin` to the response for `/reset-password`. Path matching ignores the query, so `?token=` is covered.
5. `apps/web/src/app/(public)/reset-password/page.tsx` → `ResetPasswordPage`: synchronous. The heading and the `<Suspense>` fallback go in the static shell. It passes its `searchParams` promise, unread, to the hole.
6. `apps/web/src/components/ResetPasswordForm/ResetPasswordFromLink.tsx` → `ResetPasswordFromLink`: an async Server Component that awaits `searchParams` and hands the token to the form, or `null` when it is missing, empty or repeated. React streams its HTML inside `<div hidden id="S:0">`, with an inline script that swaps it in for the fallback. That script runs before hydration, but it is still JavaScript.
7. `apps/web/src/components/ResetPasswordForm/ResetPasswordForm.tsx` → `ResetPasswordForm`: a `'use client'` component. With no token it renders `LinkInvalid` ("That link no longer works.") and no form. Otherwise it keeps the token in `useState`, puts it in a hidden `token` input, and after mount calls `window.history.replaceState(null, "", PAGE_PATH)` to take it out of the address bar.
8. `password.ts` → `resetPassword`: if "New password" and "Same again" differ, it returns state and makes no Nest call. On Nest's 204 it calls `endOldSignIn`, then `clearSessionCookies()`, then `redirect("/login?reset=1")`.
9. `apps/web/src/app/(public)/login/page.tsx` → `LoginPage`: `LoginNotice` reads `?reset=` in its own `<Suspense fallback={null}>`, and only `"1"` shows "Password changed. Roll in with the new one." The sign-in form stays in the shell. With JavaScript off the notice stays hidden, and sign-in still works.

### Look-alikes

|                        | `/forgot-password`                                    | `/reset-password`                                                    |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Reads from the request | Nothing                                               | `?token=`                                                            |
| Where the form is      | In the static shell                                   | In a `<Suspense>` hole                                               |
| With JavaScript off    | The form shows and posts. Success is a 303 to `/sent` | Only the fallback shows: "Turn on JavaScript to set a new password." |
| In this app            | `ForgotPasswordPage` → `ForgotPasswordForm`           | `ResetPasswordPage` → `ResetPasswordFromLink` → `ResetPasswordForm`  |

Both routes show as `◐` in `next build`, not `○`, because the root layout has a dynamic hole of its own.

### The code

```tsx
// NEW FILE: apps/web/src/app/(public)/reset-password/page.tsx
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordParams>;
}) {
  return (
    <PageShell.Root width="form" gap="l">
      <Heading level={1} size="3xl">
        Reset password
      </Heading>
      <Suspense
        fallback={
          // Streamed holes need a script to show. With JavaScript off the
          // fallback is all a visitor sees, so say what is missing.
          // The grid item is the wrapper, so the class goes on it.
          <div className={styles.noscript}>
            <noscript>
              <Text>Turn on JavaScript to set a new password.</Text>
            </noscript>
          </div>
        }
      >
        <ResetPasswordFromLink searchParams={searchParams} />
      </Suspense>
    </PageShell.Root>
  );
}
```

```tsx
// NEW FILE: apps/web/src/components/ResetPasswordForm/ResetPasswordFromLink.tsx
export async function ResetPasswordFromLink({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordParams>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" && token !== "" ? token : null} />;
}
```

The page never awaits `searchParams`, so it has no request-time read and stays in the shell. Only `ResetPasswordFromLink` waits. The `<noscript>` line sits in the fallback because the fallback is the one part of a hole that is in the shell. With JavaScript on, the browser ignores `<noscript>`, so the fallback is empty for the moment before the form swaps in.

### Watch out

- **Why not leave the form in the shell and put only the token in a hole**, as `NextPathField` does for `next`? Because the token decides whether there is a form at all. With no token the page shows "That link no longer works." and no form, so the whole choice has to wait for the request. AUTH-7's rule still holds: a form that must work with JavaScript off belongs in the shell. This form can't, so the story accepts that it needs JavaScript and says so.
- **Pass `null` to `replaceState`.** Next patches `window.history.replaceState` so its router follows the new URL. In `node_modules/next/dist/client/components/app-router.js`, a state object that carries Next's `__NA` flag makes the patch skip that update. The first version passed `window.history.state`, which carries `__NA`, so the router kept `?token=…` and the Server Action posted to that URL (SEC-2). The Next docs' own example passes `null`. Even now, Next's router tree in `history.state` still names the URL with the token for that entry, which the story accepted.
- **`strict-origin`, not `no-referrer`.** Both keep the path and query, and so the token, out of the `Referer` header. But under `no-referrer` the browser sends `Origin: null` with a plain HTML form post (MDN, `Referrer-Policy`), and Next refuses a Server Action whose `Origin` doesn't match the `Host`. The e2e run found it as a 500. `strict-origin` sends only the origin, so the check passes.

### Read more

- [Streaming: the HTML stream, and `<div hidden id="S:0">`](https://nextjs.org/docs/app/guides/streaming#the-html-stream)
- [Caching: working with runtime APIs (`searchParams` goes in `<Suspense>`)](https://nextjs.org/docs/app/getting-started/caching#working-with-runtime-apis)
- [Linking and navigating: the native History API](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api)
- [`headers`: `Referrer-Policy`](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers#referrer-policy)
- [Server Actions: security and the CSRF check](https://nextjs.org/docs/app/guides/server-actions#security)
- [`Referrer-Policy` and the `Origin` header, MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)
- [rendering-strategies.md: Known limit, a form in a Suspense hole never shows with JavaScript off](../context/epic-lebowski/rendering-strategies.md#known-limit-a-form-in-a-suspense-hole-never-shows-with-javascript-off)

## WEB-11: Rendering strategies guide and the /lab page

[#45](https://github.com/craig-o-curtis/dudesphere/issues/45) · 2026-10-19 · Streaming dynamic, Data Access Layer, and `forbidden()` and `unauthorized()`

**TLDR.** An admin can now open `/lab`, the Rendering lab, and see every rendering strategy the app teaches, with the routes that use each one. The idea: the static shell goes to every visitor, so anything only some visitors may see must be built inside the `<Suspense>` hole that checks who is asking. That check runs after Next has sent the shell with status 200, so `forbidden()` can swap the page for the "Off limits" page, but it can't change the status to 403.

### How it works here

A visitor opens `/lab`. Steps 5 to 7 are the three ways it can end.

1. **At build.** `apps/web/src/app/(app)/lab/page.tsx` → `LabPage` is synchronous and reads nothing from the request. `next build` prerenders the `<h1>`, the intro line, the `metadata` title and `LabIndexSkeleton`, the hole's fallback, into the static shell. It lists the route as `◐ /lab`.
2. **The rows stay out of the shell.** Only `apps/web/src/components/LabIndex/LabIndex.tsx` → `LabIndex` imports `labStrategies` and `labRoutes` from `apps/web/src/content/lab.ts`. It renders them only after `await requireAdmin("/lab")`, so no row text is in the prerendered HTML. `lab.ts` starts with `import "server-only"`, so the build fails if a Client Component ever imports it.
3. **The request.** Next sends the shell at once, with status 200, and keeps the response open. Once the first bytes have gone, the status can't change.
4. **The hole.** `LabIndex` awaits `apps/web/src/lib/session.ts` → `requireAdmin`. It calls `getMe()`, which reads the session cookie, so it must run inside `<Suspense>`. `getMe()` then asks Nest for the member. The auth side of this step is in [auth-lesson.md, WEB-11](./auth-lesson.md#web-11-rendering-strategies-guide-and-the-lab-page).
5. **A member.** `requireAdmin` calls `forbidden()`, which throws. Next renders the nearest `forbidden.tsx`, `apps/web/src/app/forbidden.tsx` → `Forbidden`, in place of the whole page: the shell's `<h1>` and intro go too, and the root layout's header and footer stay. Next adds `<meta name="robots" content="noindex">`. The status stays 200.
6. **An admin.** `requireAdmin` returns, and `LabIndex` renders one `<h2>` per strategy with its rows. React streams them in, and its inline script swaps them in for the fallback.
7. **Signed out.** `requireAdmin` calls `redirect()`, also after streaming starts. So Next sends no 307. It streams a tag that redirects in the browser, and the visitor lands on `/login?next=%2Flab`.

### Look-alikes

|                         | `forbidden()` before streaming starts                                                           | `forbidden()` after streaming starts                 |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Where the call runs     | Before Next sends a byte, such as during prerender                                              | Inside a `<Suspense>` hole, after the shell has gone |
| HTTP status             | 403                                                                                             | 200                                                  |
| `noindex` tag           | Yes                                                                                             | Yes                                                  |
| The page's static shell | None for a role check: under Cache Components, `cookies()` outside `<Suspense>` fails the build | Kept, and sent to every visitor first                |
| In this app             | Not used. For a real 403 at request time, the docs say to check in `proxy.ts`                   | `LabIndex` → `requireAdmin` → `forbidden()`          |

The plan expected a 403 for members. While building task 2, fullstack-hooker-upper found that the installed `forbidden.md` (functions, line 185) says a call after streaming starts "keeps its `200` status". On 2026-10-19 Craig chose to keep the static shell and accept 200 with `noindex`. So the tests check the forbidden copy, the `noindex` tag and that no row text is sent, never a 403.

### The code

```tsx
// NEW FILE: apps/web/src/app/(app)/lab/page.tsx
export default function LabPage() {
  return (
    <PageShell.Root>
      <Heading level={1} size="3xl">
        Rendering lab
      </Heading>
      <Text tone="muted">
        Every rendering strategy this app teaches, and the routes that use it.
      </Text>
      <Suspense fallback={<LabIndexSkeleton />}>
        <LabIndex />
      </Suspense>
    </PageShell.Root>
  );
}
```

```tsx
// NEW FILE: apps/web/src/app/forbidden.tsx
export default function Forbidden() {
  return (
    <Stack gap={3}>
      <Heading level={1}>Off limits</Heading>
      <Text size="lg">There are rules, and this room is one of them.</Text>
      <Text>
        <InlineLink href="/feed">Back to the feed</InlineLink>
      </Text>
    </Stack>
  );
}
```

Everything in `LabPage` outside the `<Suspense>` is safe for anyone: a heading and one line of intro. The check and the rows live in the same component, `LabIndex`, so the rows can't render unless the check passed.

### Watch out

- **Keep the gate in the component that renders the secret.** The static shell guide shows an `AuthGate` that sits beside the page's content in its own `<Suspense>` and returns `null`. That works for a redirect, but content beside the gate is still prerendered into the shell, and the shell goes to everyone. Here the rows render only after `await requireAdmin("/lab")`, in the same component. owasp-hacker checked the shell, the RSC payload, the prefetches and every `.next/static` file for row text, for signed-out and member visits, and found none.
- **`forbidden.tsx` replaces the page's own `<h1>`.** The first version had no heading, so a member's `/lab` had none at all (A11Y-1). `Forbidden` now has its own `<h1>`, "Off limits".
- **The tab title still says "Rendering lab" for a member.** The title is in the shell, which is sent before the role check runs (A11Y-3). The story accepts it, and `rendering-strategies.md` notes it.

### Read more

- [`forbidden`: calling it after streaming has started](https://nextjs.org/docs/app/api-reference/functions/forbidden#calling-forbidden-after-streaming-has-started)
- [`forbidden.js`: 403 before streaming, 200 after](https://nextjs.org/docs/app/api-reference/file-conventions/forbidden)
- [`loading.js`: status codes in a streamed response](https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes)
- [Optimizing the static shell: move authentication behind Suspense](https://nextjs.org/docs/app/guides/optimizing-the-static-shell#step-2-move-authentication-behind-suspense)
- [Authentication with Cache Components](https://nextjs.org/docs/app/guides/authentication-with-cache-components)
- [`redirect` in a streaming context](https://nextjs.org/docs/app/api-reference/functions/redirect)
- [rendering-strategies.md: the `/lab` page](../context/epic-lebowski/rendering-strategies.md#the-lab-page)
- [rendering-strategies.md: the Routes table](../context/epic-lebowski/rendering-strategies.md#routes)
- The auth side of this story: [auth-lesson.md, WEB-11](./auth-lesson.md#web-11-rendering-strategies-guide-and-the-lab-page)
