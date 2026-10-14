# LANE-49: Live Lane rooms

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Later. Blocked by: LANE-27, WEB-45.

**Scope:** Two to six players share one lane in real time through a Nest WebSocket gateway, with spectators who can throw reactions, and the gateway accepts connections from the web origin only.

## Gap

Lane Night is async. The fest bowling party feel needs a room where everyone sees each roll as it happens. SSE (LANE-27) is one-way and capped at 25 seconds on Vercel; a room needs a long-lived two-way connection, which Vercel functions do not hold.

## Scope

- **Nest:** `apps/api/src/lanes/live/lane-room.gateway.ts` with `@nestjs/websockets` and `@nestjs/platform-socket.io` (or `ws`, decided in the story).
  - Auth on connect: a short-lived room ticket, not the access token. `POST /lanes/rooms/:id/ticket` (Token) answers a 60-second signed ticket; the browser sends it in the handshake. This keeps the bearer token out of browser script.
  - Events: `join`, `leave`, `roll` (delivery inputs, same as API-23), `state`, `reaction` (a fixed set: "Far out", "Strike!", "Over the line!", "The Dude abides").
  - Rolls go through the same `recordRoll` and `pinfall` as Lane Night; Nest broadcasts the result.
  - CORS on the gateway only, for `FRONTEND_URL`. The REST API stays CORS-free.
- **Tables:** `lane_game` gains `mode` enum `async`, `live` (default `async`); spectators are not stored.
- **Next:** `/lanes/rooms/[id]` page with a client `useLaneRoom(id)` hook; the same `Lane` and `Scorecard` components as LANE-24.
- **Hosting:** the gateway runs on the API host (WEB-45), which keeps long-lived connections; Vercel only serves the page.

## Design notes

- **The browser talks to Nest directly here,** the one exception to the BFF rule, because Vercel cannot hold the socket. The ticket keeps the bearer token server-side.
- **Same engine, same authority.** A live roll is scored exactly like an async one.
- **Reactions are canned,** like taunts. No chat.
- **Real-time is a later bundle** in `experiences.md` (Live Lane #7).

## Rendering strategy

A dynamic page with a client WebSocket hook. Record it as "client WebSocket to a separate host", and why the BFF does not apply.

## Verification

- Three players and two spectators in one room see each roll within 500 ms.
- A connection from another origin is refused.
- An expired ticket is refused; a reused ticket is refused.
- A dropped connection rejoins and receives the current state.
- Reduced motion and keyboard paths as in LANE-24.

## Done when

- [ ] Gateway with ticket auth and origin check
- [ ] Room events and broadcasts through the shared roll path
- [ ] `mode` column migration
- [ ] Room page and hook
- [ ] Unit and e2e specs for tickets and events
- [ ] `context/overview.md` documents the gateway and its CORS
- [ ] Row added to `rendering-strategies.md`
