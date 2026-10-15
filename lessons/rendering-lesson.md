# Rendering: the lessons

This file teaches how Next.js 16.4 makes a page's HTML in Dudesphere, and how long it keeps it. Each entry comes from one story, in the order the stories were built, so the file reads as a course from top to bottom. Every step names the file and the function to open. The full table of strategies is in [rendering-strategies.md](../context/epic-lebowski/rendering-strategies.md).

## Contents

- [AUTH-7: BFF sign-up, sign-in and sign-out with httpOnly cookies](#auth-7-bff-sign-up-sign-in-and-sign-out-with-httponly-cookies): A visitor can now sign up at `/signup` and sign in at `/login`, and both forms work with JavaScript off.

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
