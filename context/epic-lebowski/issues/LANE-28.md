# LANE-28: Score Sheet for a real alley game

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Phase 2. Blocked by: WEB-5, LANE-21, API-22, FEED-14.

**Scope:** A member logs a game bowled at a real alley frame by frame, the same engine totals it as they type, Nest stores it as a `real` game, and it can post to the feed as an abiding.

## Gap

Members bowl in real life too. Logging those games ties the app to real bowling nights (ACHV-40 builds its leaderboard on them) and reuses the engine for almost nothing. Today there is nowhere to put a real score.

## Scope

**Nest:**

- `POST /lanes/score-sheets`, Token: body

  ```ts
  { rolls: { pins: number; foul: boolean }[]; alley?: string; playedAt: string; nightId?: number }
  ```

  - `rolls` must be a complete game: every roll passes `validateRoll` in turn and `isComplete` is true. A refusal answers 400 `ROLL_INVALID` naming the roll index and the `RollRefusal`.
  - `alley`: up to 100 characters. `playedAt`: a UTC instant, checked with gmt, not in the future and not more than a year ago. `nightId` is accepted once API-39 lands.
  - Creates a `lane_game` with `source: "real"`, `status: "finished"`, one `lane_player` (the caller, `joined`) and the rolls with `input: null`. No seed.
  - Answers 201 with `LaneGameResponse`.

- `lane_game` gains `alley varchar(100)` and `playedAt timestamptz`, both nullable (one migration).
- `GET /lanes/games?source=real`, Token: the caller's logged games.
- `DELETE /lanes/score-sheets/:id`, owner: deletes a real game. 204. Lane Night games cannot be deleted this way.

**Next:**

- `apps/web/src/app/(app)/lanes/score-sheet/page.tsx`: `requireSession()` inside Suspense.
- `ScoreSheetForm.tsx` (Client Component): ten frame boxes. Each box takes keys: digits, `X` or `x` for a strike, `/` for a spare, `-` for a miss, `F` for a foul. The box refuses an impossible key at once with the engine's reason ("That's 11 pins in one frame."). The running total updates as the member types, from `scoreGame`. The 10th frame opens its third box only after a strike or spare.
- Alley name and date fields. The date is a date input; the action turns it into a UTC instant with gmt.
- "Post it to the feed" checkbox, on by default. On save, the Server Action `saveScoreSheet` calls `POST /lanes/score-sheets`, then, if checked, FEED-14's `postAbiding` with a message such as "Bowled a 187 at Hollywood Star Lanes. #scoresheet". The member can edit the message before saving.
- The member's logged games list on `/lanes` under "Real games".

## Design notes

- **Same engine, `source: real`.** No second scoring path. Rolls are stored; totals are computed.
- **Self-reported.** Nothing checks a real score. The "Mark it zero" dispute vote is parked in `experiences.md` until real-score volume exists.
- **The abiding is a separate write.** Nest does not post the abiding; the Server Action does, after the game is saved, so a failed post never loses the game.
- **Keyboard first.** The sheet is typed, not tapped, and works with a screen reader: each box is a labelled input ("Frame 4, ball 1").

## Rendering strategy

Dynamic page with a client form that runs `lane-engine` in the browser for instant totals, and a Server Action that saves through Nest and chains a second action for the abiding.

## Verification

- Type the USBC example `X X X 7 2 8 / F 9 X 7 / 9 - X X 8`: the running totals read 30, 57, 76, 85, 95, 104, 124, 143, 152, 180 as the frames complete; save; Nest stores 17 rolls and answers total 180.
- Type `7` then `4` in frame 1: refused in the box with the reason; nothing is sent.
- Bypass the form and send 19 rolls: 400 `ROLL_INVALID`, game incomplete.
- A future `playedAt`: 400.
- With "Post it to the feed": the feed shows the abiding. Without: no abiding.
- Delete a real game: 204; deleting a Lane Night game through this route: 404.
- E2E: the e2e cleanup removes these games with their users.

## Done when

- [ ] `POST /lanes/score-sheets`, `DELETE /lanes/score-sheets/:id`, `source=real` filter
- [ ] `alley` and `playedAt` columns
- [ ] Score Sheet page with live totals and per-box refusals
- [ ] Optional abiding through `postAbiding`
- [ ] Unit and e2e specs as listed
- [ ] `context/overview.md` Lane Night section covers score sheets
- [ ] Row added to `rendering-strategies.md`
