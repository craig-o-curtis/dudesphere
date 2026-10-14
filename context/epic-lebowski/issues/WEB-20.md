# WEB-20: SEO and sharing

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 1. Blocked by: FEED-12, FEED-16, FEED-17.

**Scope:** Every page has a title and description, threads have a generated share image, the site has a sitemap and robots file, and missing pages and errors render in the app's voice.

## Gap

Shared links show a bare URL. Search engines get no sitemap. A wrong URL shows Next's default 404, and a thrown error shows a blank page in production. The app's voice stops at the edges.

## Scope

- `apps/web/src/app/layout.tsx`: `metadata` with `metadataBase` from `process.env.SITE_URL`, a title template `"%s · Dudesphere"`, a default description, and `openGraph.siteName`.
- `generateMetadata` on:
  - `/abidings/[id]`: title "[display name] on Dudesphere"; description: the first 160 characters of the message.
  - `/dudes/[id]`: title is the display name. `robots: { index: false }`, because profiles need a token.
- `apps/web/src/app/opengraph-image.tsx`: the site card, 1200 by 630, from `ImageResponse` in `next/og`. Original art: lane boards and the wordmark set in the display font.
- `apps/web/src/app/(app)/abidings/[id]/opengraph-image.tsx`: the message (up to 200 characters), the display name, and the wordmark. Uses the cached `getAbiding(id)` from FEED-16.
- `apps/web/src/app/sitemap.ts`: `/`, `/login`, `/signup`, `/laws`, `/rules`, `/stranger`, and the 500 newest abidings from `GET /abidings?limit=100` over five pages, each `/abidings/<id>` with `lastModified` from `updatedAt`.
- `apps/web/src/app/robots.ts`: allow `/`; disallow `/admin`, `/api`, `/dudes/me`, `/lab`; point at the sitemap.
- `apps/web/src/app/not-found.tsx`: heading "You're out of your element." Body: "That page isn't here, man." Links to `/feed` and `/`.
- `apps/web/src/app/error.tsx` (Client Component): "Something went sideways. The Dude abides; try again." with a "Try again" button that calls `reset()`.
- `apps/web/src/app/global-error.tsx`: the same copy, its own `<html>` and `<body>`.
- `catchError` boundaries around the risky islands (ticker, profile card) so one failed fetch shows a small inline message instead of the page error. Confirm the `catchError` API in the Next 16.4 docs first.

## Design notes

- **No film stills or logos in share images.** Original type and pattern only. "The Big Lebowski" is not in any title, wordmark or image.
- **Profiles stay out of search.** They need a token to view, so indexing them would index a sign-in redirect.
- **The sitemap is cached.** `sitemap.ts` reads through a `'use cache'` function with `cacheLife("hours")`.
- **`SITE_URL`** is a new env var in `apps/web/.env.example`, `http://localhost:3001` in development.

## Rendering strategy

`generateMetadata` for per-page metadata; `opengraph-image.tsx` as `ImageResponse` Route Handlers; `sitemap.ts` and `robots.ts` as metadata routes; `not-found.tsx`, `error.tsx` and `catchError` as the error-handling rows.

## Verification

- Paste a thread URL into a link preview tool (or fetch its HTML): the title, description and image URL are set; the image renders at 1200 by 630.
- `/sitemap.xml` lists the static pages and recent abidings; `/robots.txt` disallows the listed paths.
- `/no-such-page` shows "You're out of your element." with status 404.
- Throw in a test route: `error.tsx` shows with "Try again".
- Stop the API, load the splash: the ticker's boundary shows its inline message; the rest of the page renders.
- `/dudes/<id>` HTML carries `noindex`.

## Done when

- [ ] Root metadata and `generateMetadata` on threads and dude pages
- [ ] Site and thread OG images
- [ ] `sitemap.ts` and `robots.ts`
- [ ] `not-found.tsx`, `error.tsx`, `global-error.tsx` and `catchError` boundaries
- [ ] `SITE_URL` in `.env.example`
- [ ] Rows added to `rendering-strategies.md`
