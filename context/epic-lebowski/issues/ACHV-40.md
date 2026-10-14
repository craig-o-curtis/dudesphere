# ACHV-40: Bowling Night UI and group leaderboard

Part of the Lebowski epic. See [index.md](../index.md). Realm: Achievers. Phase 4. Blocked by: API-39, ACHV-38, LANE-28.

**Scope:** Group pages gain a Bowling Nights tab where members schedule nights, RSVP and check in, a night page that lists who is coming and the games logged there, and a Leaderboard tab built from Lane Night and Score Sheet games.

## Gap

API-39 holds nights and computes the board; nobody can see them. The night is where online and real bowling meet.

## Scope

- `apps/web/src/app/(app)/groups/[slug]/nights/page.tsx`: upcoming and past nights from `GET /groups/:slug/nights`. Each row: title, alley, local date and time (from `startsAt` and `timeZone`, through gmt), "12 going".
- `.../nights/new/page.tsx`: title, alley, address, date, time. The time zone defaults to the browser's. Server Action `scheduleNight` builds the UTC instant through gmt and calls `POST /groups/:slug/nights`.
- `apps/web/src/app/(app)/nights/[id]/page.tsx`:
  - Details, a map link (a plain `https://www.openstreetmap.org/search?query=` link with the address; no embedded map).
  - RSVP buttons "I'm in", "Maybe", "Can't make it" (Server Action `rsvp`).
  - "Check in" button, shown only inside the window; it reads "Checked in. Let's go bowling."
  - Who's coming, from `GET /nights/:id/rsvps`.
  - Games logged here, from `GET /nights/:id/games`, with a "Log my game" link to the Score Sheet (LANE-28) carrying `nightId`.
  - An `.ics` download: `apps/web/src/app/(app)/nights/[id]/calendar.ics/route.ts` builds a VEVENT from the night (UTC times through gmt).
- `apps/web/src/app/(app)/groups/[slug]/leaderboard/page.tsx`: a table from `GET /groups/:slug/leaderboard`, with a period switch (30 days, 90 days, all time). Columns: rank, display name, games, average, best, strikes per game. Read through `'use cache'` with `cacheLife("minutes")` and `cacheTag("leaderboard:" + slug)`. Saving a score sheet or finishing a Lane Night game calls `revalidateTag` for each group the player is in.
- Badges from the glossary next to names: "Turkey" for a game with three strikes in a row, "Perfect game" for a 300.

## Design notes

- **Local time shown, UTC stored.** Every displayed time comes from gmt with the night's own zone, and a viewer in another zone sees "7:30 PM Louisville time".
- **No embedded map.** A link is enough and avoids a map provider and its tracking.
- **The leaderboard is friendly.** No "worst" column. Members with no games are not listed.

## Rendering strategy

Night pages are dynamic for RSVP state, with details read through a cached function tagged `night:<id>`. The leaderboard is `'use cache'` with `cacheLife('minutes')` and a group tag, invalidated by `revalidateTag(tag, 'max')` from score writes. The `.ics` file is a Route Handler that returns `text/calendar`.

## Verification

- Schedule a night at 19:30 in `America/Kentucky/Louisville`: Nest stores the right UTC instant; a viewer in Los Angeles sees "7:30 PM Louisville time".
- RSVP changes update the count at once.
- "Check in" is hidden two hours before and shows 30 minutes before.
- Log a score sheet from the night page: the game shows on the night and on the leaderboard after the tag refresh.
- The `.ics` file imports into a calendar app at the right time.
- The leaderboard period switch changes the rows.
- Keyboard: RSVP, check-in and the period switch work; the table has a caption and header scopes.

## Done when

- [ ] Nights list, new night form and night page
- [ ] RSVP, check-in and `.ics` download
- [ ] Leaderboard tab with period switch and cached reads
- [ ] Tag invalidation from score writes
- [ ] Row added to `rendering-strategies.md`
