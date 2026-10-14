# ACHV-38: Groups UI

Part of the Lebowski epic. See [index.md](../index.md). Realm: Achievers. Phase 4. Blocked by: WEB-5, AUTH-8, API-37, FEED-14.

**Scope:** Members find, create, join and leave Achievers groups, and each group has a page with its own feed and compose box.

## Gap

API-37 stores groups, but members cannot see them. Without a page, nobody finds a local chapter.

## Scope

- `apps/web/src/app/(app)/groups/page.tsx`, "The Achievers":
  - "Your groups" from `GET /groups/mine` (Token), inside Suspense.
  - "Find a group": a search by name and city over `GET /groups?q=&city=` (Public), paginated.
  - "Start a group" link.
- `apps/web/src/app/(app)/groups/new/page.tsx`: name, slug (filled from the name, editable), city, description. Server Action `createGroup` calls `POST /groups`; 409 `GROUP_SLUG_TAKEN` shows under the slug.
- `apps/web/src/app/(app)/groups/[slug]/page.tsx`:
  - Header from `GET /groups/:slug` through a `'use cache'` function with `cacheTag("group:" + slug)`: name, city, description, member count.
  - "Join" or "Leave" button for signed-in visitors (Server Actions `joinGroup`, `leaveGroup`). 409 `LAST_ORGANIZER` shows "Hand the keys to another organizer first."
  - The group feed: FEED-13's `FeedList` with `groupId`.
  - FEED-14's `ComposeBox` with a hidden `groupId` for members only. The placeholder reads "Say something to the [group name] Achievers".
  - Tabs reserved for "Bowling Nights" and "Leaderboard" (ACHV-40).
- `apps/web/src/app/(app)/groups/[slug]/settings/page.tsx`, organizers and admins: edit, manage roles, delete. Others get `forbidden()`.
- An abiding posted in a group shows a small "in [group name]" link on its card everywhere.

## Design notes

- **Public group pages.** Groups and their posts are public, like abidings. Membership lists need a session.
- **Copy.** Page title "The Achievers". Join button "Join the Achievers". Leave "Leave the group". Empty group feed: "Quiet in here. Start the conversation."
- **No fest branding.** A group is a chapter, never "Lebowski Fest" (legal caveat).

## Rendering strategy

The group header is `'use cache'` with a per-group tag inside a PPR shell; the membership button and the members list read the session inside Suspense. Writes are Server Actions that call `updateTag("group:<slug>")`.

## Verification

- Create `e2e-venice`: redirected to its page as organizer.
- A second member joins: count goes up at once; their compose box appears.
- A non-member sees the feed but no compose box.
- Post in the group: it shows in the group feed and in `/feed` with "in Venice Achievers".
- The last organizer tries to leave: the message shows.
- A member opens settings: forbidden view.
- Keyboard and screen reader can search, join, post and leave.

## Done when

- [ ] `/groups`, `/groups/new`, `/groups/[slug]` and settings pages
- [ ] Join, leave, create, edit and role actions with Nest's errors
- [ ] Group feed and member-only compose
- [ ] "in [group name]" link on cards
- [ ] Row added to `rendering-strategies.md`
