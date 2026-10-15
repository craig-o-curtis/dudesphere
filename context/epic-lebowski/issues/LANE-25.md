# LANE-25: Turn flow and gentle timeout

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Phase 2. Blocked by: LANE-24.

**Scope:** Members start games from a dude page, see invites and every game waiting on them in `/lanes`, get a "Phone's ringing, Dude" nudge when it is their turn, and a game left 72 hours pauses with "The Dude abides; game paused" instead of being forfeited.

## Gap

A game exists only if someone knows it is their turn. Without a lobby, invites and a turn signal, async bowling dies after the first frame. Words With Friends coverage names many parallel games and a clear "your turn" as the main reasons people come back.

## Scope

- `apps/web/src/app/(app)/lanes/page.tsx`, "The Lanes":
  - "Your turn" list from `GET /lanes/games?turn=mine`.
  - "Invites" from `GET /lanes/games?status=invited` where the caller's player status is `invited`, with "Let's go bowling" (accept) and "Not today" (decline).
  - "Waiting on them" and "Finished" lists.
  - Each row: opponents' display names, frame number, scores so far, and when the turn is due ("due in 2 days").
  - A first-visit explainer card: "One frame per turn. Take your time; the lane waits 72 hours, then the game pauses."
- "Let's go bowling" button on `/dudes/[id]` (FEED-17): Server Action `startGame([id])` calls `POST /lanes/games` and redirects to `/lanes/<new id>`.
- A "Bowl with others" picker on `/lanes` for up to 3 opponents, by searching display names through `GET /profiles?limit=...`.
- Turn signal in the app header: a small pin icon with the count of my-turn games, "Phone's ringing, Dude" as its label. It polls `GET /lanes/games?turn=mine&limit=1` (reading `meta.totalItems`) with TanStack Query `refetchInterval: 30_000` while the tab is visible, and `refetchIntervalInBackground: false`.
- The polls go through `clientFetch` and AUTH-8's `/api/bff/[...path]`, whose allow-list doesn't have `lanes` yet. Add `lanes` to it in `apps/web/src/lib/bff-paths.ts`, with a spec line.
- While a game page is open and it is the opponent's turn, `useQuery` on the game polls every 5 seconds (`refetchInterval: 5_000`), and stops when it is the viewer's turn or the game ends.
- Paused games: Nest reports `status: "paused"` once `turnDueAt` has passed (API-22). The game page and list show "The Dude abides; game paused." Either player can press "Nudge back in", a new Nest route:
  - `POST /lanes/games/:id/resume`, player in the game: sets `turnStartedAt` to now and `turnDueAt` 72 hours later, same seat. 200. Allowed only when paused.
- Rematch: on a finished game, "Rematch" calls `POST /lanes/games/:id/rematch`.
- After a loss, the result card says "Sometimes you eat the bar, and sometimes the bar eats you." After a win: "Far out."

## Design notes

- **Polling, not push, in the MVP.** No web push or email per turn. The SSE ticker (LANE-27) is for public events; turns poll. Live rooms come with LANE-49.
- **Pause, never forfeit.** A paused game keeps its rolls. Nobody loses because life happened.
- **Quiet mode extends the clock.** ABIDE-32 moves `turnDueAt` past a member's quiet day. This story uses `turnDueAt` as Nest gives it.
- **Copy.** "Phone's ringing, Dude" for the turn badge. "Let's go bowling" for the main call to action. "Not today" to decline. The "sometimes you eat the bar" line is short and paraphrased; no longer quote.

## Rendering strategy

`/lanes` is dynamic and streams its lists inside Suspense. The header badge and the in-game wait use TanStack Query polling with `refetchInterval` while a game is live, the lesson's row for client polling.

## Verification

- A invites B from B's dude page: B's header badge shows 1 within 30 seconds; B's `/lanes` shows the invite.
- B accepts: A's game page, polling, shows B joined and A's turn.
- Six games in parallel: the badge count matches `turn=mine`.
- Set `turnDueAt` in the past (test helper): both players see "game paused"; "Nudge back in" restarts the clock for the same seat.
- Background tab: no polling requests.
- Rematch creates a new game with `rematchOfId`.
- `resume` on a live game answers 409 `GAME_NOT_PAUSED` (new code).
- Keyboard and screen reader can accept, decline, open and rematch.

## Done when

- [ ] `/lanes` lobby with the four lists and the explainer
- [ ] "Let's go bowling" on dude pages and the multi-opponent picker
- [ ] Header turn badge with visibility-aware polling
- [ ] In-game polling while waiting
- [ ] `POST /lanes/games/:id/resume` with e2e specs; `GAME_NOT_PAUSED` code
- [ ] Rematch and result copy
- [ ] Row added to `rendering-strategies.md`
