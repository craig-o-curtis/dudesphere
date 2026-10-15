# ABIDE-32: Shomer Shabbos quiet mode

Part of the Lebowski epic. See [index.md](../index.md). Realm: Abide. Phase 3. Blocked by: WEB-5, API-29, LANE-25.

**Scope:** A member picks one weekly quiet day; on that day the app shows no turn badge, and every Lane Night turn clock that would run through it is extended by the day, so no game pauses because someone rested.

## Gap

Walter will not bowl on Saturday. A humane app gives everyone a day off. Today a turn clock (LANE-25) keeps running on any day, and the header badge nags every day. The member picks the day; Saturday is only a suggestion.

## Scope

**Next:**

- `/dudes/me` gains a "Quiet day" section: "Pick a day the lanes leave you alone." A select of Monday to Sunday plus "Off", suggesting Saturday. Server Action `setQuietDay` calls `PATCH /profiles/me` with `quietWeekday` and, if missing, the browser's `timeZone`.
- On the member's quiet day (in their time zone):
  - The header turn badge (LANE-25) is hidden and its polling stops.
  - `/lanes` shows "Shomer Shabbos. The lanes are closed for you today." above the lists. The member can still open and play a game if they choose.
- The quiet check uses gmt to get the weekday of now in the member's zone.

**Nest** (in `apps/api/src/lanes/`):

- When a turn starts (`recordRoll`, `accept`, `resume`), `turnDueAt` is computed as: start plus 72 hours, then plus 24 hours for each of the next player's quiet days that falls inside that window, in their time zone. One helper, `turnDueAt(start: string, quietWeekday: number | null, timeZone: string | null): string`, written with gmt and unit-tested.
- A quiet day set after a turn started does not move that turn's clock; it applies from the next turn.

## Design notes

- **The member picks the day.** No default day. "Off" is a valid choice.
- **Paused, not penalized.** The clock is extended, never frozen on a schedule job. Nest computes `turnDueAt` once, at turn start.
- **No push to silence.** The MVP has no push notifications; quiet mode hides the in-app nudge and moves the clock.
- **Respectful copy.** "Shomer Shabbos" is Walter's phrase and the feature's name. The page explains it plainly: "A weekly day off from turns. Pick any day."
- **Dates through gmt.** Weekday, zone conversion and the 24-hour additions all go through `@northguild/gmt`.

## Rendering strategy

The quiet banner reads the profile inside Suspense on a dynamic page. The badge decision runs on the client from the profile the layout already has. No new rendering pattern; record it under "dynamic streaming".

## Verification

Nest unit specs for `turnDueAt` (quiet day Saturday, zone `America/New_York`):

- Start Wednesday 2026-10-14T15:00:00Z: due Saturday is inside the 72 hours, so due is Sunday 2026-10-18T15:00:00Z.
- Start Saturday 2026-10-17T12:00:00Z (a quiet day itself): the remaining part of Saturday counts as a quiet day, so 24 hours are added.
- `quietWeekday` null: due is exactly 72 hours later.
- A daylight-saving change inside the window (2026-11-01 in New York): the due instant is 72 plus 24 elapsed hours, computed with gmt.

E2E:

- Set Saturday; on a Saturday (test clock) the header badge is absent and `/lanes` shows the banner.
- An opponent's turn that spans the member's quiet day has `turnDueAt` one day later than without it.
- Set "Off": `quietWeekday` null; clocks are 72 hours.

## Done when

- [ ] Quiet day setting on `/dudes/me`
- [ ] Badge and banner behave on the quiet day
- [ ] `turnDueAt` helper with gmt, used at every turn start
- [ ] Unit and e2e specs as listed
- [ ] `context/overview.md` Lane Night section notes the quiet-day extension
- [ ] Row added to `rendering-strategies.md`
