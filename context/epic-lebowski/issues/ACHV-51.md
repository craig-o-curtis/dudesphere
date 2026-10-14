# ACHV-51: Fest Finder and Day of the Dude

Part of the Lebowski epic. See [index.md](../index.md). Realm: Achievers. Later. Blocked by: API-39, ACHV-40.

**Scope:** Members submit fan fests, screenings and Day of the Dude parties to a moderated calendar, and every March 6 the app runs a Day of the Dude event with a tournament and a limited badge.

## Gap

Real fests still run (Achiever Fest in Louisville, independent fests such as Moscow, Idaho in 2026), and Day of the Dude, March 6, is Dudeism's high holy day. Nothing in the app points at either. `experiences.md` parks both until the first March after launch.

## Scope

- **Fest Finder:**
  - Table `fest_event`: `id`, `title` varchar(100), `kind` enum `fest`, `screening`, `party`, `startsAt` timestamptz, `timeZone`, `city` varchar(100), `venue` varchar(100), `url` varchar(300), `submittedById` FK, `status` enum `pending`, `approved`, `rejected`, timestamps.
  - `POST /fests` (Token, submit, `pending`), `GET /fests?from=&to=` (Public, approved only), `POST /fests/:id/approve` and `/reject` (Admin).
  - `/fests` page: a month calendar and a list, filtered by city text.
- **Day of the Dude:**
  - A seasonal config in Nest: `GET /seasons/current` answers `{ id: "day-of-the-dude-2027", startsAt, endsAt }` around March 6 in each member's zone.
  - During the window: a site banner, a Lane Night tournament bracket for opted-in members (built on API-22 games with a `seasonId` tag), and a "Day of the Dude 2027" badge for anyone who checks in that day.
  - A bathrobe avatar frame as the cosmetic.

## Design notes

- **Never "Lebowski Fest" as our brand.** Listings may name a fest by its own title, as a listing, with a link to its own site. Our feature name is "Fest Finder".
- **Moderated.** Submissions are pending until an admin approves, and Walter's Rules (API-43) apply.
- **Dates through gmt,** including March 6 in each member's zone.

## Rendering strategy

`/fests` is `'use cache'` with `cacheLife('hours')` and a `fests` tag, refreshed on approval. The Day of the Dude banner reads the cached season config.

## Verification

- A submitted fest is invisible until approved; approved, it shows on the calendar.
- A non-admin approving: 403.
- With a test clock on 2027-03-06 in `Asia/Tokyo` and `America/Los_Angeles`, each member sees the banner on their own March 6.
- Checking in on Day of the Dude awards the badge once.

## Done when

- [ ] `fest_event` table, routes and admin approval
- [ ] `/fests` calendar and list
- [ ] Season config, banner, tournament and badge for Day of the Dude
- [ ] Unit and e2e specs; cleanup updated
- [ ] `context/overview.md` updated
- [ ] Row added to `rendering-strategies.md`
