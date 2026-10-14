# FEED-14: Compose and reply with optimistic insert

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 1. Blocked by: FEED-13.

**Scope:** Members post an abiding or a reply from a compose box whose Server Action inserts the card optimistically, shows Nest's field errors, and refreshes the cached lists with `updateTag`.

## Gap

The feed is read-only. A member cannot post or reply. Posting is the lesson's row for Server Actions with `useActionState` and `useOptimistic`, and for read-your-own-writes cache invalidation.

## Scope

- `apps/web/src/lib/actions/abidings.ts`:

  ```ts
  export async function postAbiding(prev: ComposeState, formData: FormData): Promise<ComposeState>;
  ```

  - Re-checks the session with `verifySession()`; none redirects to `/login`.
  - Calls Nest `POST /abidings` (Token) with `{ message, imageUrl?, replyToId? }`.
  - On 201: `updateTag("abidings")`, and for a reply also `updateTag("abiding:" + replyToId)`. Returns `{ ok: true, abiding }`.
  - On 400: returns `{ ok: false, fieldErrors, values }` so the box keeps the text.
  - On 401 after the session check: redirect to `/api/auth/refresh?next=` the current path.

- `apps/web/src/components/ComposeBox/ComposeBox.tsx` (Client Component):
  - `useActionState(postAbiding, initial)`.
  - `useOptimistic` on the feed's list: on submit it adds a card marked "pending" at the top. On error the card slides out and the text returns to the box.
  - A textarea with a live count to 280. "Abide" submit button, disabled while pending or over 280.
  - An optional image URL field behind "Add an image link". No upload: image upload is deferred.
  - On success: the strike animation (CSS: ten pins fall, 600 ms) and the card settles. Under reduced motion the card just appears.
- Reply: `AbidingCard`'s "Reply" opens the same `ComposeBox` inline under the card with `replyToId` set and the placeholder "Reply to [display name]".
- Discard guard: leaving the page, or closing an inline reply, with text in the box opens a confirm dialog: "Careful, man, there's a beverage here." Buttons "Keep writing" and "Discard".
- FEED-13's `FeedList` reads the optimistic list from the box's context, and after `updateTag` the next server render brings the real card.

## Design notes

- **`updateTag`, not `revalidateTag`.** `updateTag` expires the tag and makes the next read wait for fresh data, so the poster sees their own abiding at once. It can only be called from a Server Action.
- **Field errors come from Nest's 400.** No zod. Nest checks 1 to 280 characters, the URL, and that `replyToId` exists.
- **Hashtags are Nest's job.** The box does not parse tags; Nest derives them from `message`.
- **Compose is a progressive-enhancement form.** With JavaScript off the form still posts and the page reloads with the new abiding.
- **The strike is the app's reward.** It is short, never blocks input, and has a reduced-motion branch.

## Rendering strategy

Server Actions with `useActionState` for the form state and `useOptimistic` for the instant card. Cache invalidation by `updateTag('abidings')` for read-your-own-writes, which also refreshes the splash ticker (FEED-12).

## Verification

- Post "e2e hello #e2e<12 hex>": the card shows at once marked pending, then settles; the splash ticker shows it on the next load.
- Post 281 characters by bypassing the counter (devtools): Nest's 400 message shows under the box and the text stays.
- Reply to a card: the reply posts with `replyToId`, and FEED-16's thread shows it.
- Kill the API mid-post: the optimistic card slides out, the text returns, and an error line says "That didn't land. Try again."
- Type, then navigate away: the beverage dialog shows; "Keep writing" stays; "Discard" leaves.
- With JavaScript off, posting works and the page reloads.
- Reduced motion: no strike animation.

## Done when

- [ ] `postAbiding` Server Action with session re-check and `updateTag`
- [ ] `ComposeBox` with `useActionState`, `useOptimistic`, counter and image link
- [ ] Inline reply from any card
- [ ] Discard guard dialog
- [ ] Strike animation with a reduced-motion branch
- [ ] Vitest specs for the action's 201, 400 and 401 paths
- [ ] Row added to `rendering-strategies.md`
