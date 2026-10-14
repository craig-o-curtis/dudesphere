# ABIDE-31: Take-It-Easy timer

Part of the Lebowski epic. See [index.md](../index.md). Realm: Abide. Phase 3. Blocked by: WEB-5, AUTH-8, API-29.

**Scope:** A calm timer of 1 to 10 minutes with a breathing prompt runs in the browser, and finishing it saves a session through a Server Action and can post "abided for 5 min" to the feed.

## Gap

"Take it easy" is the Dudeist motto. The app has nothing that helps a member actually do it. A short, quiet timer is the most direct version, and it costs almost nothing.

## Scope

- `apps/web/src/app/(app)/abide/timer/page.tsx`: `requireSession()` inside Suspense; renders `<TakeItEasyTimer />`.
- `apps/web/src/components/TakeItEasyTimer/` (Client Component):
  - Pick 1 to 10 minutes (buttons 1, 3, 5, 10 and a stepper).
  - "Take it easy" starts. A circle grows over 4 seconds ("Breathe in") and shrinks over 6 ("Breathe out"), looping. Remaining time below it.
  - "Pause" and "Stop". Stopping early saves nothing.
  - Time is tracked from `performance.now()` deltas, so a background tab does not drift. The start instant for the record comes from gmt.
  - Finishing plays one soft chime (Web Audio, off unless sound is on, shared with LANE-24's audio helper) and shows "Far out. You took it easy for 5 minutes."
- Server Action `saveTimerSession({ minutes, startedAt, finishedAt })` calls Nest `POST /timer-sessions`.
- "Share it" checkbox on the finish card: posts an abiding "Abided for 5 min. #takeiteasy" through FEED-14's `postAbiding`.
- The screen stays awake with the Screen Wake Lock API where supported; the timer works without it.

## Design notes

- **The timer is client-only.** No database work until it finishes. C.4 lists it among things that live in Next.
- **Reduced motion.** The breathing circle does not scale; instead the words "Breathe in" and "Breathe out" swap, and a thin progress bar fills.
- **Copy.** Start button "Take it easy". Finish "Far out." The motto is short and generic, safe to use.
- **Nest checks the span.** A forged session with a wrong span gets 400 (API-29).

## Rendering strategy

A client component on a dynamic page; one Server Action on finish. The lesson's row for "all client state, one server write".

## Verification

- Run a 1-minute timer: Nest stores one session with `minutes: 1` and a span of about 60 seconds.
- Switch tabs for 30 seconds mid-run: the remaining time is still correct on return.
- Stop early: nothing is saved.
- "Share it": the feed shows the abiding.
- Reduced motion: no scaling, words swap, the bar fills.
- Keyboard: pick, start, pause, stop and share without a mouse; the remaining time is announced each minute through `aria-live="polite"`.

## Done when

- [ ] Timer page and component with the breathing loop
- [ ] `saveTimerSession` Server Action and optional share
- [ ] Wake lock where supported
- [ ] Reduced-motion branch
- [ ] Vitest specs for the time math and the finish state
- [ ] Row added to `rendering-strategies.md`
