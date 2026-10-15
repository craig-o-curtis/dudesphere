# ABIDE-30: Daily "The Dude abides" check-in

Part of the Lebowski epic. See [index.md](../index.md). Realm: Abide. Phase 3. Blocked by: WEB-5, AUTH-8, API-29, WEB-54.

**Scope:** One tap on "The Dude abides" checks the member in for the day with an optional one-line mood, and the app shows a soft streak as "strikes and gutters", with no shaming.

## Gap

Abiding is Dudeism's core practice, and the app has no daily ritual for it. A one-tap check-in is the cheapest daily habit the app can offer, and it feeds the Lane Certificate (RUG-35), which needs seven.

## Scope

- `apps/web/src/components/AbideButton/AbideButton.tsx`: a large button "The Dude abides" in the app header and on `/abide`. After a check-in it reads "Abided today" with a check mark.
- `apps/web/src/app/(app)/abide/page.tsx`: the button, an optional mood input ("How's it going, man?", up to 80 characters), the streak card, and a 7-day strip.
- Server Action `checkIn(prev, formData)`:
  - Re-checks the session.
  - If the profile has no `timeZone`, sends the browser's zone (a hidden input filled from `Intl.DateTimeFormat().resolvedOptions().timeZone`) through `PATCH /profiles/me` first.
  - Calls Nest `POST /checkins` with `{ mood }`.
  - Then `after(() => ...)` refreshes the streak cache with `revalidateTag("checkins:" + userId, "max")`, so the response is not delayed by it.
  - Returns the success state for `useActionState`.
- Streak card from `GET /checkins/me/summary`:
  - "Current run: 4 days. Best: 9."
  - The 7-day strip shows a pin standing for a day checked in and a gutter mark for a missed day: "strikes and gutters".
  - A missed day says nothing harsh. Copy after a break: "Strikes and gutters, man. Good to see you."
- Success toast: "The Dude abides." Three turkey-style badges in the card: 3 days "Turkey", 4 days "Four-bagger", 12 days "Perfect game". Labels only, no stored badges.

## Design notes

- **No shaming.** No red, no "you broke your streak", no counters that reset loudly. A gap is just a gutter mark.
- **The member's day.** Nest computes the day from the profile's time zone (API-29). The browser only supplies the zone once.
- **`after()` for the streak.** The write that matters (the check-in) happens in the request; refreshing the cached summary happens after the response is sent.
- **One per day.** A second tap updates the mood and keeps one row.

## Rendering strategy

Dynamic page with a Server Action and `after()`, the lesson's row for work after the response. The summary is read through a `'use cache'` function keyed by user with `cacheTag("checkins:" + userId)` and invalidated from `after()`.

## Verification

- First tap: 201 in Nest, toast "The Dude abides.", button reads "Abided today".
- Second tap with a new mood: one row, mood updated.
- Check in on three days in a row (test clock): the card shows "Current run: 3 days" and the "Turkey" label.
- Skip a day: the strip shows a gutter mark; no warning copy.
- A member with no time zone: the first check-in sets it from the browser.
- Keyboard: the button and mood field work; the toast is announced.
- Reduced motion: the check mark appears without animation.

## Done when

- [ ] `AbideButton` in the header and `/abide` page
- [ ] `checkIn` Server Action with the time zone step and `after()`
- [ ] Streak card and 7-day strip with the no-shaming copy
- [ ] Vitest specs for the strip and the copy states
- [ ] Row added to `rendering-strategies.md`
