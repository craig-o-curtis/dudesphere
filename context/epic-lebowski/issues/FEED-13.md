# FEED-13: Feed with infinite scroll and hashtag chips

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 1. Blocked by: WEB-5, AUTH-8, WEB-54.

**Scope:** `/feed` is the signed-in home: the newest abidings with infinite scroll on `links.next`, and up to 10 hashtag chips that filter the list.

## Gap

There is no way to read abidings in the web app. The feed is the Twitter part of Dudesphere and the page members will open most. It is also the lesson's "dynamic page that streams" row: it depends on who is signed in and on the URL's filters.

## Scope

- `apps/web/src/app/(app)/feed/page.tsx`: calls `requireSession("/feed")` inside Suspense. Renders `<FeedList initialPage={...} tags={...} />` with the first page fetched on the server.
- `apps/web/src/app/(app)/feed/loading.tsx`: five card skeletons.
- `apps/web/src/components/FeedList/FeedList.tsx` (Client Component):
  - `useInfiniteQuery` from `@tanstack/react-query` v5:
    - `queryKey: ["abidings", { tags }]`
    - `queryFn: ({ pageParam }) => clientFetch(pageParam)` where `pageParam` is the relative `links.next` path
    - `initialPageParam: "/abidings?limit=20"`, plus `&hashtag=a,b` when chips are on
    - `getNextPageParam: (last) => last.links.next` (null stops it)
    - `initialData` from the server page
  - An `IntersectionObserver` on a sentinel after the last card calls `fetchNextPage()`. A visible "Load more" button does the same, for keyboard and screen-reader users.
  - Cards below the fold use `content-visibility: auto` with `contain-intrinsic-size`.
- `apps/web/src/components/AbidingCard/`: display name (links to `/dudes/<userId>`), message with `#tags` linked, image if `imageUrl`, relative time through gmt, and a "Reply" button (wired in FEED-14). After API-15 it also shows the reply count.
- `apps/web/src/components/HashtagChips/`: chips from the URL `?tags=a,b`. A search box filters `GET /hashtags` with a 250 ms debounce. At most 10 chips: the 11th is refused with "Ten tags at a time, man." Toggling a chip updates the URL with `router.replace` inside `startTransition`.
- `apps/web/src/app/providers.tsx`: `QueryClientProvider` with one `QueryClient` per browser session (`useState(() => new QueryClient())`). Default `staleTime: 30_000`.
- New-items banner: on window focus, TanStack refetches page one. If its first id differs from the shown first id, a banner says "New abidings have come to light." Pressing it scrolls to the top and shows them.
- Nest routes used: `GET /abidings?limit=20&page=N` and `&hashtag=a,b` (Public), `GET /hashtags?limit=...` (Public). Client calls go through `/api/bff/abidings` and `/api/bff/hashtags`.

## Design notes

- **`links.next` drives paging.** The client never builds page numbers. Nest's links are relative paths, so `clientFetch` prefixes `/api/bff`.
- **No SSR hydration of the query cache beyond `initialData`.** The server renders page one; the client owns the rest.
- **The feed needs a session, the data does not.** `/abidings` is Public, but the feed is the signed-in home. Anonymous visitors go to `/login?next=/feed`.
- **Tags in the URL.** A filtered feed is shareable and survives a reload.
- **Copy.** Empty feed: "Nothing here yet. The Dude abides; you could too." with a link to compose. Error: "Lotta ins, lotta outs. Something didn't come through." with "Try again".
- **The glossary line is bleeped.** "New sh*t has come to light" becomes "New abidings have come to light".

## Rendering strategy

Dynamic streaming. The page reads `cookies()` through `requireSession()` inside Suspense, so it renders at request time and `loading.tsx` shows at once. The first page of data is fetched on the server and handed to TanStack Query as `initialData`; later pages are client fetches. This is the lesson's row for "server first page, client infinite query".

## Verification

- Seed 45 e2e abidings. `/feed` shows 20; scrolling loads 40, then 45, then stops; no request after `links.next` is null.
- "Load more" works with the keyboard alone.
- Chips `#e2e<12 hex>` and a second tag show abidings with either tag (match any).
- The 11th chip is refused with the message.
- `/feed?tags=a,b` after a reload keeps both chips.
- Anonymous `/feed` redirects to `/login?next=%2Ffeed`.
- The new-items banner shows after another member posts and the tab regains focus.
- Reduced motion: cards appear without the enter animation.

## Done when

- [ ] `/feed` page, `loading.tsx` and `FeedList` with `useInfiniteQuery`
- [ ] `AbidingCard` and `HashtagChips` with their CSS Modules
- [ ] `QueryClientProvider` in `providers.tsx`; `@tanstack/react-query` added
- [ ] New-items banner
- [ ] Vitest specs for `getNextPageParam` and the 10-chip limit
- [ ] Row added to `rendering-strategies.md`
