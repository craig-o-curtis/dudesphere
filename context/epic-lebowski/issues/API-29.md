# API-29: Profile extensions, check-ins and timer sessions

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 3. Blocked by: none.

**Scope:** The profile gains the Rug config, a quiz alignment, a quiet day, a time zone and the Lane Certificate date, and two new Postgres tables store daily check-ins and Take-It-Easy timer sessions, each with Token routes.

## Gap

Every Phase 3 ritual stores something per member: a daily check-in, a timer session, a rug theme, a quiz result, a quiet day, a certificate. None of those columns or tables exist. Daily rituals also need the member's own day, which needs a time zone the app does not store today.

## Scope

**Profile columns** (one migration on `profile`):

| Column            | Type                                              | Notes                                                           |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `rugConfig`       | jsonb, nullable                                   | `{ seed: string; palette: string; motif: string }` (RUG-33)     |
| `alignment`       | enum `dude`, `walter`, `donny`, `maude`, nullable | Laws of the Lane quiz result (RUG-34)                           |
| `timeZone`        | varchar(64), nullable                             | IANA name, such as `America/Los_Angeles`. Validated through gmt |
| `quietWeekday`    | smallint, nullable                                | ISO weekday 1 (Monday) to 7 (Sunday). Null means off (ABIDE-32) |
| `laneCertifiedAt` | timestamptz, nullable                             | Set by Nest when the Lane Certificate is earned (RUG-35)        |

- `UpdateProfileDto` accepts `rugConfig`, `alignment`, `timeZone` and `quietWeekday` through `PATCH /profiles/me`. `rugConfig` is validated as an object with those three string fields, each up to 32 characters. `laneCertifiedAt` is never accepted from a client.
- `ProfileResponseDto` returns all five.

**`checkins` table:**

| Column      | Type                                 | Notes                           |
| ----------- | ------------------------------------ | ------------------------------- |
| `id`        | serial PK                            |                                 |
| `userId`    | int FK `user.id` `ON DELETE CASCADE` |                                 |
| `day`       | date                                 | The member's local calendar day |
| `mood`      | varchar(80), nullable                |                                 |
| `createdAt` | timestamptz                          |                                 |

Unique `(userId, day)`.

**`timer_sessions` table:**

| Column       | Type                                 | Notes                              |
| ------------ | ------------------------------------ | ---------------------------------- |
| `id`         | serial PK                            |                                    |
| `userId`     | int FK `user.id` `ON DELETE CASCADE` | Indexed                            |
| `minutes`    | smallint                             | `CHECK (minutes BETWEEN 1 AND 10)` |
| `startedAt`  | timestamptz                          |                                    |
| `finishedAt` | timestamptz                          |                                    |
| `createdAt`  | timestamptz                          |                                    |

**Modules and routes:**

`apps/api/src/checkins/`:

| Method | Path                   | Access | Does                                                                                                                          |
| ------ | ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/checkins`            | Token  | `{ mood? }`. Today's check-in in the member's time zone (UTC if unset). 201 new, 200 if today's already exists (mood updated) |
| GET    | `/checkins/me`         | Token  | Paginated, newest first                                                                                                       |
| GET    | `/checkins/me/summary` | Token  | `{ checkedInToday, currentStreak, bestStreak, total, last7: boolean[] }`                                                      |

`apps/api/src/timer-sessions/`:

| Method | Path                 | Access | Does                                                                                                                               |
| ------ | -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/timer-sessions`    | Token  | `{ minutes, startedAt, finishedAt }`. `finishedAt - startedAt` within 10 seconds of `minutes`; `finishedAt` not in the future. 201 |
| GET    | `/timer-sessions/me` | Token  | Paginated, newest first                                                                                                            |

`apps/api/src/profiles/`:

| Method | Path                            | Access | Does                                                                                                                            |
| ------ | ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/profiles/me/lane-certificate` | Token  | Sets `laneCertifiedAt` when `alignment` is set and `checkins` holds 7 or more days. 200. Otherwise 409 `CERTIFICATE_NOT_EARNED` |

**Streaks:** computed on read from `checkins.day`. `currentStreak` counts consecutive days ending today or yesterday (a streak survives until the end of the day after the last check-in). Dates and day arithmetic through gmt.

## Design notes

- **The member's day, not UTC's.** A check-in at 23:30 in Los Angeles counts for that day. `day` is computed in Nest from `timeZone` through gmt; a member with no time zone uses UTC, and the web app sets the zone from the browser on first check-in.
- **Store `date` as a string.** Confirm that the pg driver returns `date` (OID 1082) as `YYYY-MM-DD` text, as the app already reads timestamps as strings; set the type parser if not. No `Date`.
- **Soft streaks.** No penalty, no reset message. ABIDE-30 decides the copy.
- **`laneCertifiedAt`, not a boolean.** The certificate shows a date, and null already means "not earned".
- **Camel-case columns,** as on `user` and `profile`. Table names are the plan's.

## Verification

E2E with e2e users:

- `POST /checkins` twice on one day: 201 then 200; one row.
- With `timeZone: "Pacific/Kiritimati"` and the clock at 2026-10-14T11:00:00Z, the stored `day` is 2026-10-15.
- Check-ins on days 1, 2, 3 and 5: `currentStreak` 1 on day 5, `bestStreak` 3, `total` 4.
- `POST /timer-sessions` with 5 minutes and a 5-minute span: 201. With 5 minutes and a 2-minute span: 400. With `minutes: 11`: 400.
- `PATCH /profiles/me` with `timeZone: "Mars/Olympus"`: 400. With `quietWeekday: 8`: 400. With `laneCertifiedAt`: 400 (unknown field).
- `POST /profiles/me/lane-certificate` with 6 check-ins: 409 `CERTIFICATE_NOT_EARNED`. With 7 and an alignment: 200 and the date set.
- `checkins` and `timer_sessions` rows of e2e users are deleted and counted in the shared e2e cleanup in `apps/api/test/e2e-cleanup.ts`, so `pnpm e2e:check` sees them.

## Done when

- [ ] Migration with the five profile columns and both tables
- [ ] Check-ins module with summary and streaks
- [ ] Timer sessions module
- [ ] Lane certificate route and `CERTIFICATE_NOT_EARNED`
- [ ] Unit and e2e specs as listed; cleanup updated
- [ ] `packages/api-types` gains the new response types
- [ ] `context/overview.md` gains the columns, tables and routes
