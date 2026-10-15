# FEED-16: Thread page and thread modal

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 1. Blocked by: WEB-5, API-15, FEED-14.

**Scope:** `/abidings/[id]` shows one abiding and its replies, and opening it from the feed shows it as a modal over a feed that stays alive, with a View Transition between the two.

## Gap

An abiding has no page of its own. Replies post (FEED-14) but cannot be read as a conversation. This is the forum part of the app, and the lesson's row for parallel and intercepting routes, `<Activity>`, per-item cache tags and View Transitions.

## Scope

- `apps/web/src/app/(app)/abidings/[id]/page.tsx`: the full page.
  - `getAbiding(id)` with `"use cache"`, `cacheLife("minutes")`, `cacheTag("abiding:" + id)`, calling Nest `GET /abidings/:id` (Public).
  - `getReplies(id, page)` with `"use cache"`, `cacheTag("abiding:" + id)`, calling `GET /abidings?replyToId=<id>&limit=20` (Public). More pages load on the client with TanStack Query, as in FEED-13.
  - A signed-in visitor also sees the author's profile card from `GET /profiles/user/:userId` (Token), inside Suspense. An anonymous visitor sees the abiding and the display name only, because profiles need a token.
  - A reply box (FEED-14's `ComposeBox` with `replyToId`) for signed-in members; "Roll in to reply" for anonymous visitors.
  - A missing id calls `notFound()`.
- `apps/web/src/app/(app)/@modal/(.)abidings/[id]/page.tsx`: the intercepting route. The same content in a `<dialog>` over the feed. Escape or the close button calls `router.back()`.
- Add `@base-ui/react` to `apps/web` (WEB-54 left it out) and build `Dialog` in `components/ui/` on it, following `ui-composition/references/base-ui.md`. Check the current version with ctx7 first, and install none of its optional date peers.
- `apps/web/src/app/(app)/@modal/default.tsx`: returns `null`.
- `apps/web/src/app/(app)/layout.tsx`: renders `{children}` and `{modal}`. The feed's subtree is wrapped in React's `<Activity mode={modalOpen ? "hidden" : "visible"}>` so the feed keeps its scroll and query state while the modal is open.
- Edit and delete on the thread page, for the author or an admin: Server Actions `editAbiding` (`PATCH /abidings/:id`) and `deleteAbiding` (`DELETE /abidings/:id`). Both call `revalidateTag("abiding:" + id, "max")` and `revalidateTag("abidings", "max")`, then `refresh()` so this client's router shows the change.
- View Transitions:
  - `<Link href={"/abidings/" + id} transitionTypes={["open-thread"]}>` on the card.
  - React `<ViewTransition name={"avatar-" + userId}>` around the avatar on both the card and the thread header, so it slides between them.
  - CSS in `thread.module.css` for `::view-transition-*` under the `open-thread` type: the list shrinks toward the card, which grows into the header. 250 ms.
  - Under `prefers-reduced-motion: reduce`, the transition CSS is a 150 ms cross-fade.

## Design notes

- **Three ways to invalidate, side by side.** `updateTag` (FEED-14) for the poster's own write. `revalidateTag(tag, "max")` here for edits: other visitors get the stale copy once while it refreshes in the background. `refresh()` to update this client's router without a full navigation.
- **A tag per abiding.** `abiding:<id>` lets an edit refresh one thread without dumping every cached list.
- **No usernames.** The thread shows display names only; the API does not send usernames.
- **Direct links work.** Opening `/abidings/<id>` in a new tab renders the full page, not the modal.

## Rendering strategy

The abiding and its first page of replies are `'use cache'` with a per-item `cacheTag`, inside a PPR shell. The author card reads the session inside Suspense. Parallel and intercepting routes show the modal; `<Activity>` keeps the feed alive behind it. View Transitions with `transitionTypes` and `<ViewTransition>` animate the swap.

## Verification

- From `/feed`, click a card: the URL becomes `/abidings/<id>`, the modal opens, and the feed behind it keeps its scroll position. Escape closes it, and the feed has made no new request.
- Reload on `/abidings/<id>`: the full page renders, not the modal.
- Post a reply in the modal: it shows at the top of the replies at once.
- Edit as the author: the thread shows the new text at once; a second browser sees the old text on its first load and the new text on the next.
- Anonymous: the thread shows, the author card does not, and "Roll in to reply" links to `/login?next=`.
- `/abidings/000000000000000000000000` shows the "You're out of your element" not-found page (WEB-20).
- Reduced motion: a cross-fade, no growing card.
- Keyboard: focus moves into the dialog on open and returns to the card on close.

## Done when

- [ ] Full thread page with cached abiding and replies
- [ ] Intercepting-route modal, `@modal/default.tsx` and `<Activity>` in the layout
- [ ] Edit and delete actions with `revalidateTag(tag, "max")` and `refresh()`
- [ ] View Transitions with a reduced-motion branch
- [ ] Focus management for the dialog
- [ ] `@base-ui/react` added, and `ui/Dialog` built with a spec
- [ ] Vitest specs for the tag names and the actions
- [ ] Row added to `rendering-strategies.md`
