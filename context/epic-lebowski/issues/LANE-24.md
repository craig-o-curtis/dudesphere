# LANE-24: Lane Night UI

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Phase 2. Blocked by: WEB-5, AUTH-8, LANE-21, API-22, API-23, WEB-54.

**Scope:** `/lanes/[id]` draws a 2D top-down lane where the player aims, sets power and spin, and releases on a timing meter, with "Over the line!" fouls, the "MARK IT ZERO" stamp, sound, and a live scorecard.

## Gap

The backend can run a game, but nobody can play one. This is the screen members will spend the most time on, and the lesson's row for client-only components and `use(browser())`.

## Scope

- `apps/web/src/app/(app)/lanes/[id]/page.tsx`: `requireSession()` inside Suspense; loads the game through `GET /lanes/games/:id`; renders `<LaneTable game={...} />`. A 403 renders "That's not your lane, man." with a link to `/lanes`.
- `apps/web/src/components/lane/`:
  - `Lane.tsx` (Client Component): a `<canvas>` sized to its container, drawn with Canvas 2D in a `requestAnimationFrame` loop that runs only while the ball rolls or pins fall. The lane shows 39 boards, arrows, the foul line, and the ten pins in their triangle.
  - `AimControl.tsx`: a slider over boards 1 to 39 and a spin slider from hook left to hook right.
  - `ReleaseMeter.tsx`: press "Roll" (or Space) to start a meter that sweeps 0 to 120 and back; press again to release. Power is set from a second sweep, or from a slider in the accessible mode.
  - `Scorecard.tsx`: ten frames per player with symbols (`X`, `/`, `-`, `F`) and running totals from `lane-engine` `scoreGame`. Totals stay blank until a frame's bonus balls are in.
  - `MarkItZeroStamp.tsx`: a red rubber-stamp "MARK IT ZERO" over the lane on a foul.
  - `LaneTable.tsx`: composes the above and owns the turn state.
- Release flow:
  1. On release, `Lane` draws `ballPath(delivery)` from `lane-engine` at once.
  2. In parallel, a Server Action `roll(gameId, { seq, aim, power, spin, timing })` calls `POST /lanes/games/:id/rolls`.
  3. When the ball reaches the pins, the pins fall to the answer's `knocked`. If the answer has not arrived, the ball waits at the pins.
  4. On a foul: the ball stops at the line, a "Over the line!" banner shows, then the "MARK IT ZERO" stamp lands. The scorecard shows `F`.
  5. The scorecard updates from the answer's `game`. When the turn passes, the controls lock with "Waiting on [display name]".
- Sound through Web Audio: a roll rumble, pin clatter scaled by `pins`, a stamp thud. All sounds are generated or original recordings; none from the film. `apps/web/src/lib/audio.ts` creates the `AudioContext` through `use(browser())` so it only exists in the browser. Sound is off until the member turns it on once ("Sound: on / off" toggle, remembered in `localStorage`).
- Strike and spare callouts: "Strike!", "Spare.", "Double!", "Turkey!", "Four-bagger!" from the engine's frames.
- Keyboard: Left and Right move aim; Shift with Left and Right sets spin; Space starts and releases the meter. Every control also has a visible button.
- Accessible mode: a "Set it by numbers" toggle swaps the timing meter for three inputs (aim, power, spin) and a "Release" button with a timing of 90. No reflex needed.

## Design notes

- **Everything here is a client component except the page shell.** The canvas, the meter and audio need the browser.
- **The engine runs twice, on purpose.** `ballPath` and `scoreGame` run in the browser for instant feedback; Nest runs `pinfall` and is the truth.
- **Reduced motion.** No rolling ball: the ball jumps to the pins, the pins are shown fallen, the stamp fades in for 150 ms. The meter becomes the numbers mode.
- **Foul copy.** Banner: "Over the line!" Stamp: "MARK IT ZERO". A foul line rule under the meter: "Release before the line. Over it, and it's a foul."
- **Avoid list.** No coffee-can or ashes jokes, no toe gag, nothing on the Jesus's backstory, no film audio.
- **The canvas is decoration plus input.** The scorecard and turn status are DOM text with `aria-live="polite"`, so a screen reader hears "Frame 3, ball 1: 7 pins."

## Rendering strategy

Client components on a dynamic page. `use(browser())` gates Web Audio to the browser, the lesson's row for browser-only APIs. The roll is a Server Action called from a client event, not a form.

## Verification

- Play a full game against an e2e opponent through the UI: frames, symbols and totals match `scoreGame` on the stored rolls.
- Release with timing over 100: "Over the line!", the stamp, `F` on the card, 0 pins.
- Double-click "Roll": one roll is stored (the `seq` check).
- Throttle the network to 3 seconds: the ball waits at the pins, then they fall.
- Keyboard alone: aim, spin, release, and read the result.
- Screen reader: each roll's result is announced once.
- Reduced motion: no animation, the result is shown at once.
- Sound is off on first load; turning it on plays the three sounds.
- A non-player opening the URL sees the "not your lane" view.

## Done when

- [ ] `/lanes/[id]` page and `LaneTable`
- [ ] Canvas lane, aim and spin controls, release meter, numbers mode
- [ ] Scorecard from `scoreGame`, callouts, foul banner and stamp
- [ ] Server Action `roll` with the `seq` check
- [ ] Web Audio through `use(browser())`, off by default
- [ ] Reduced-motion and keyboard paths
- [ ] Vitest specs for the scorecard and the release state machine
- [ ] Row added to `rendering-strategies.md`
