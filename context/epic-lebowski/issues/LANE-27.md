# LANE-27: SSE lane ticker

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Phase 2. Blocked by: API-22, LANE-24.

**Scope:** A Next Route Handler streams public Lane Night events (strikes, turkeys, finished games) to the browser as Server-Sent Events, polling Nest every 3 seconds inside the stream, closing after 25 seconds, and letting `EventSource` reconnect.

## Gap

The lanes feel empty when nobody can see anyone else bowl. A live ticker ("Walter just threw a turkey") makes the alley feel busy. A WebSocket gateway is LANE-49's job; SSE works on Vercel today with no extra service.

## Scope

**Nest:**

- `GET /lanes/events?after=<cursor>&limit=20`, Public. Answers `{ data: LaneEvent[], cursor: string }`, newest last.
- `LaneEvent`: `{ id: string; kind: "strike" | "spare-conversion" | "turkey" | "four-bagger" | "game-finished" | "perfect-game"; gameId: number; displayName: string; frame: number | null; total: number | null; at: string }`.
- Events are derived on read from `lane_roll` rows newer than the cursor, with `lane-engine` `frames()` deciding the kind. The cursor is the last `lane_roll.id` seen, opaque to the client. No events table.
- Only `lane-night` games; no Score Sheet games. A member can opt out with `profile.laneEventsHidden boolean default false` (one migration); their rolls never appear.
- `LaneEvent` added to `packages/api-types`.

**Next:**

- `apps/web/src/app/api/lanes/ticker/route.ts`, `GET`:

  ```ts
  export async function GET(request: Request) {
    const stream = new ReadableStream({
      start(controller) {
        /* loop */
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  }
  ```

  - Reads `Last-Event-ID` (sent by `EventSource` on reconnect) as the starting cursor.
  - Every 3 seconds calls Nest `GET /lanes/events?after=<cursor>` and writes each event as `id: <cursor>\nevent: lane\ndata: <json>\n\n`.
  - Writes a `: keep-alive` comment every 15 seconds.
  - Closes the stream after 25 seconds and sends `retry: 1000` first, so the browser reconnects within a second.
  - Stops early when `request.signal` aborts.

- `apps/web/src/components/LaneTicker/LaneTicker.tsx` (Client Component): `new EventSource("/api/lanes/ticker")`, a list of the last 8 events with `aria-live="polite"` and a pause button. Lines such as "Walter threw a turkey in frame 6." and "Maude finished a game: 212."
- The ticker shows on `/lanes` and the splash (FEED-12).

## Design notes

- **25-second cap.** Vercel functions have a maximum duration. Closing early and reconnecting keeps each request well inside it and costs one reconnect per 25 seconds per viewer.
- **The fan-out is in Next, the data is in Nest.** Next holds no state; each stream polls on its own. At MVP traffic that is fine; LANE-49 or a shared cache can change it.
- **Public by design, with an opt-out.** Display names only, never usernames, and nothing from a member who hid their lane events.
- **No new table.** Events come from rolls, so they cannot disagree with the scorecards.

## Rendering strategy

A streaming Route Handler returning a `ReadableStream` as `text/event-stream`, the lesson's row for SSE on a serverless host. `EventSource` handles reconnect with `Last-Event-ID`.

## Verification

- Open `/lanes` in two browsers; bowl a strike in a third: both tickers show it within 4 seconds.
- Watch the network panel: each ticker request lasts about 25 seconds and the next starts within about 1 second, carrying `Last-Event-ID`; no event is shown twice.
- `laneEventsHidden: true` for the bowler: no event appears.
- A Score Sheet game: no events.
- Close the tab: the Route Handler's loop stops (server log).
- Reduced motion: new lines appear without sliding.
- E2E for `GET /lanes/events`: cursor paging, kinds for the USBC 180 game (strikes in frames 1, 2, 3, 7, a turkey after frame 3, `game-finished` at 180).

## Done when

- [ ] `GET /lanes/events` with derived kinds, cursor and opt-out column
- [ ] `api/lanes/ticker` streaming Route Handler with the 25-second cap and keep-alive
- [ ] `LaneTicker` with `EventSource`, pause and `aria-live`
- [ ] Unit and e2e specs as listed
- [ ] `context/overview.md` Lane Night section covers events
- [ ] Row added to `rendering-strategies.md`
