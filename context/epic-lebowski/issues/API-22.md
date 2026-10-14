# API-22: Lane Night tables and game routes

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 2. Blocked by: LANE-21.

**Scope:** Postgres holds Lane Night games, their players and their raw rolls, and Nest routes let a member start a game, invite friends, accept or decline, read a game's state, and list the games waiting on their turn.

## Gap

Lane Night is the anchor of the epic and has no data behind it. A game spans days and devices, so its state must live on the server. The scoring engine (LANE-21) exists; nothing stores what it scores.

## Scope

**Module** `apps/api/src/lanes/`: `lanes.module.ts`, `lane-games.controller.ts`, `lane-games.service.ts`, `lane-game.policy.ts`, `dto/`, and the three entities. It depends on `@dudesphere/lane-engine`.

**Tables** (one migration):

`lane_game`

| Column          | Type                                                  | Notes                                                      |
| --------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `id`            | serial PK                                             |                                                            |
| `source`        | enum `lane-night`, `real`                             | `real` is the Score Sheet (LANE-28)                        |
| `status`        | enum `invited`, `live`, `finished`, `declined`        | `paused` is computed, not stored                           |
| `seed`          | text, nullable                                        | Server secret, 32 random bytes as base64url. Set by API-23 |
| `createdById`   | int FK `user.id` `ON DELETE CASCADE`                  |                                                            |
| `currentSeat`   | smallint, nullable                                    | Whose turn; null when not live                             |
| `turnStartedAt` | timestamptz, nullable                                 |                                                            |
| `turnDueAt`     | timestamptz, nullable                                 | `turnStartedAt` plus 72 hours (LANE-25, ABIDE-32)          |
| `rematchOfId`   | int FK `lane_game.id`, nullable, `ON DELETE SET NULL` |                                                            |
| `createdAt`     | timestamptz                                           |                                                            |
| `updatedAt`     | timestamptz                                           |                                                            |
| `finishedAt`    | timestamptz, nullable                                 |                                                            |

`lane_player`

| Column     | Type                                      | Notes                       |
| ---------- | ----------------------------------------- | --------------------------- |
| `id`       | serial PK                                 |                             |
| `gameId`   | int FK `lane_game.id` `ON DELETE CASCADE` |                             |
| `userId`   | int FK `user.id` `ON DELETE CASCADE`      | Indexed                     |
| `seat`     | smallint                                  | 1 to 4                      |
| `status`   | enum `invited`, `joined`, `declined`      | The creator starts `joined` |
| `joinedAt` | timestamptz, nullable                     |                             |

Unique `(gameId, userId)` and `(gameId, seat)`.

`lane_roll`

| Column      | Type                                        | Notes                                     |
| ----------- | ------------------------------------------- | ----------------------------------------- |
| `id`        | serial PK                                   |                                           |
| `playerId`  | int FK `lane_player.id` `ON DELETE CASCADE` |                                           |
| `seq`       | smallint                                    | 0 to 20, this player's roll number        |
| `pins`      | smallint                                    | `CHECK (pins BETWEEN 0 AND 10)`           |
| `foul`      | boolean                                     | `CHECK (NOT foul OR pins = 0)`            |
| `input`     | jsonb, nullable                             | Delivery inputs for `lane-night` (API-23) |
| `createdAt` | timestamptz                                 |                                           |

Unique `(playerId, seq)`.

Columns are camelCase like `user` and `profile`. Table names are the plan's.

**Routes**, all on `@Controller("lanes/games")`:

| Method | Path                       | Access                    | Does                                                                                                   |
| ------ | -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/lanes/games`             | Token                     | `{ opponentIds: number[] }`, 1 to 3 user ids. Creates the game, `status: invited`. 201                 |
| GET    | `/lanes/games`             | Token                     | The caller's games, paginated, newest activity first. `?turn=mine` for my-turn only; `?status=` filter |
| GET    | `/lanes/games/:id`         | Player in the game        | The game's state                                                                                       |
| POST   | `/lanes/games/:id/accept`  | Invited player            | Joins. When every invitee has joined: `status: live`, seat 1's turn starts. 200                        |
| POST   | `/lanes/games/:id/decline` | Invited player            | Declines. With fewer than two joined players left, the game becomes `declined`. 200                    |
| POST   | `/lanes/games/:id/rematch` | Player in a finished game | A new game with the same players, `rematchOfId` set. 201                                               |

The roll route `POST /lanes/games/:id/rolls` is API-23's. This story adds the service method it calls:

```ts
recordRoll(gameId: number, userId: number, roll: Roll, input: Delivery | null): Promise<LaneGameState>
```

It locks the `lane_game` row (`SELECT ... FOR UPDATE`), checks the turn, runs `validateRoll`, inserts the roll, and moves the turn to the next seat when the player's frame is complete (one frame per turn). When every player's rolls are complete it sets `finished` and `finishedAt`.

**State response** (`LaneGameResponseDto`, added to `packages/api-types` as `LaneGameResponse`):

```ts
{
  id, source, status, // status includes the computed "paused"
  currentSeat, turnDueAt, createdAt, finishedAt, rematchOfId,
  players: [{ seat, userId, displayName, status, frames: Frame[], total: number }],
  seed: string | null, // only once finished
}
```

`frames` and `total` come from `scoreGame` on the stored rolls.

**Policy** `LaneGamePolicy` with `view`, `respond` and `rematch`, used as `@Can(LaneGamePolicy, "view")`. A member not in the game gets 403.

**Error codes:** `NOT_YOUR_TURN` (409), `GAME_NOT_LIVE` (409), `ROLL_INVALID` (400, with the `RollRefusal` in the message), `OPPONENT_NOT_FOUND` (400).

## Design notes

- **Keyed by `user.id`, in Postgres.** Games relate users to users, so they belong beside the user table with real foreign keys and cascades.
- **Rolls only. No totals.** `frames` and `total` are computed on read through `lane-engine`, as research.md requires.
- **`paused` is computed.** A live game whose `turnDueAt` has passed reads as `paused`. No cron job. LANE-25 decides what happens next.
- **One frame per turn.** After a strike, or two balls, or the 10th frame's last ball, the turn passes.
- **Opponents by id.** A member invites from a dude page (`/dudes/[id]`). A soft-deleted or unknown id answers `OPPONENT_NOT_FOUND`.
- **Row lock for every turn change.** Two requests from two tabs cannot both roll.
- **Dates through gmt.** `turnDueAt` is `addUtc(turnStartedAt, { hours: 72 })` or the gmt equivalent.

## Verification

E2E, `lanes.e2e-spec.ts`, e2e users only:

- A creates a game with B: 201, `status: invited`, A `joined`, B `invited`.
- B accepts: `status: live`, `currentSeat: 1`, `turnDueAt` 72 hours after `turnStartedAt`.
- C (not in the game) reads it: 403.
- B declines a 1v1 invite: `status: declined`.
- `GET /lanes/games?turn=mine` for A lists the live game; for B it does not.
- `recordRoll` (service spec) with B's id on A's turn: `NOT_YOUR_TURN`.
- `recordRoll` with `{ pins: 7 }` then `{ pins: 4 }`: `ROLL_INVALID` `frame-over-ten`.
- After A rolls a strike, `currentSeat` is 2.
- Play the USBC 180 rolls for A and 20 zeros for B through `recordRoll`: `status: finished`, A's `total` 180, B's 0, `seed` visible.
- Rematch: new game, same players, `rematchOfId` set.
- Soft-delete B: B's games drop out of A's list.
- `apps/api/test/global-setup.ts` deletes `lane_roll`, `lane_player` and `lane_game` rows of e2e users (the cascade covers them when the users go; add the explicit deletes so the counts are logged).

## Done when

- [ ] Migration with the three tables and checks
- [ ] Entities, module, controller, service, policy, DTOs
- [ ] `recordRoll` with the row lock and turn passing
- [ ] Error codes added to `ErrorCode`
- [ ] Unit and e2e specs as listed; tables in the e2e cleanup
- [ ] `LaneGameResponse` in `packages/api-types` with a drift line
- [ ] `context/overview.md` gains a "Lane Night" section
