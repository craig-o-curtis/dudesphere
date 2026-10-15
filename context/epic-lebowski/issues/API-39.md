# API-39: Bowling Night events and the group leaderboard

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 4. Blocked by: API-22, API-37.

**Scope:** A group can schedule a Bowling Night at a real alley, members RSVP and check in, real games can be logged to the night, and Nest answers a group leaderboard computed from members' games.

## Gap

Groups can talk but cannot meet. Lebowski Fest started as a night at a bowling alley; a scheduler for real nights is the social glue the app is missing. A leaderboard gives the group a reason to log games.

## Scope

**Tables** (one migration):

`bowling_night`

| Column        | Type                                            | Notes                        |
| ------------- | ----------------------------------------------- | ---------------------------- |
| `id`          | serial PK                                       |                              |
| `groupId`     | int FK `achiever_group.id` `ON DELETE CASCADE`  | Indexed                      |
| `title`       | varchar(100)                                    |                              |
| `alley`       | varchar(100)                                    |                              |
| `address`     | varchar(200), nullable                          |                              |
| `startsAt`    | timestamptz                                     |                              |
| `timeZone`    | varchar(64)                                     | IANA, for showing local time |
| `createdById` | int FK `user.id` `ON DELETE SET NULL`, nullable |                              |
| `createdAt`   | timestamptz                                     |                              |
| `updatedAt`   | timestamptz                                     |                              |
| `cancelledAt` | timestamptz, nullable                           |                              |

`rsvp`

| Column        | Type                                          | Notes   |
| ------------- | --------------------------------------------- | ------- |
| `nightId`     | int FK `bowling_night.id` `ON DELETE CASCADE` | PK part |
| `userId`      | int FK `user.id` `ON DELETE CASCADE`          | PK part |
| `answer`      | enum `yes`, `maybe`, `no`                     |         |
| `checkedInAt` | timestamptz, nullable                         |         |
| `updatedAt`   | timestamptz                                   |         |

`lane_game` gains `nightId` int FK `bowling_night.id` `ON DELETE SET NULL`, nullable. LANE-28's `POST /lanes/score-sheets` starts accepting `nightId` (the caller must have RSVP'd yes or checked in).

**Routes**, module `apps/api/src/nights/`:

| Method | Path                        | Access                    | Does                                                                                    |
| ------ | --------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/groups/:slug/nights`      | Group member              | `{ title, alley, address?, startsAt, timeZone }`. `startsAt` in the future. 201         |
| GET    | `/groups/:slug/nights`      | Public                    | `?when=upcoming` (default) or `past`, paginated                                         |
| GET    | `/nights/:id`               | Public                    | The night with RSVP counts                                                              |
| PATCH  | `/nights/:id`               | Creator, organizer, admin | Edit                                                                                    |
| POST   | `/nights/:id/cancel`        | Creator, organizer, admin | Sets `cancelledAt`. 200                                                                 |
| PUT    | `/nights/:id/rsvp`          | Group member              | `{ answer }`. 200                                                                       |
| GET    | `/nights/:id/rsvps`         | Token                     | RSVPs with display names                                                                |
| POST   | `/nights/:id/check-in`      | Group member              | Allowed from 1 hour before to 6 hours after `startsAt`. 200. Else 409 `CHECK_IN_CLOSED` |
| GET    | `/nights/:id/games`         | Public                    | Real games logged to the night with totals                                              |
| GET    | `/groups/:slug/leaderboard` | Public                    | `?period=30d                                                                            | 90d | all`(default`90d`) |

**Leaderboard:** for each current member, from finished `lane_game` rows of both sources in the period: games played, best game, average, strikes per game. Totals come from `lane-engine` `scoreGame` over stored rolls. At most the last 50 games per member are read. Sorted by average, then best. Members with no games are left out.

## Design notes

- **No stored totals.** The leaderboard computes from rolls, as everywhere. Groups are small, so this is cheap; the web caches the answer (ACHV-40).
- **Dates through gmt.** `startsAt` is a UTC instant; `timeZone` exists only for display. The check-in window is computed with gmt.
- **Lane Night and real games both count.** A member's online and alley games sit on one board, so the board rewards playing either way.
- **A cancelled night stays listed** with "Cancelled", so nobody shows up to an empty alley.

## Verification

E2E with e2e users and an `e2e-` group:

- A member creates a night 3 days ahead: 201. A non-member: 403. `startsAt` in the past: 400.
- RSVP yes, then maybe: one row, answer `maybe`.
- Check in 2 hours early: 409 `CHECK_IN_CLOSED`. 30 minutes early: 200.
- Log a real game with `nightId`: it shows in `GET /nights/:id/games`.
- Leaderboard with A (games 180 and 150) and B (one game 90): A first with average 165, best 180; B second.
- A member who leaves the group drops off the board.
- Cancel: `cancelledAt` set; RSVP after cancel: 409 `NIGHT_CANCELLED`.
- New tables are deleted and counted in the shared e2e cleanup in `apps/api/test/e2e-cleanup.ts`, so `pnpm e2e:check` sees them.

## Done when

- [ ] Migration with both tables and `lane_game.nightId`
- [ ] Nights module, routes and policy
- [ ] Check-in window with gmt
- [ ] Leaderboard read from rolls through `lane-engine`
- [ ] Error codes `CHECK_IN_CLOSED`, `NIGHT_CANCELLED`
- [ ] Unit, e2e and route-access specs; cleanup updated
- [ ] `packages/api-types` and `context/overview.md` updated
