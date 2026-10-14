# API-23: Server-authoritative pinfall

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 2. Blocked by: LANE-21, API-22.

**Scope:** A seeded, deterministic pin model in `packages/lane-engine` turns a delivery's aim, power, spin and timing into pinfall, and `POST /lanes/games/:id/rolls` takes only those inputs, so Nest decides every pin and no client can send a strike.

## Gap

API-22 stores rolls but has no public way to make one. If the client sent pin counts, anyone with devtools could bowl 300. The client must send what the player did, and the server must decide what fell.

## Scope

**Engine** (`packages/lane-engine/src/pinfall.ts`):

```ts
export interface Delivery {
  readonly aim: number; // integer board 1..39, 20 is the head pin
  readonly power: number; // 0..1
  readonly spin: number; // -1 (hook left) .. 1 (hook right)
  readonly timing: number; // release meter 0..120, FOUL_LINE is 100
}

/** Pins standing before this ball: a 10-bit mask, bit 0 is pin 1. */
export type PinSet = number;
export const FULL_RACK: PinSet = 0b1111111111;

export function ballPath(delivery: Delivery): readonly { x: number; y: number }[];

export function pinfall(
  delivery: Delivery,
  seed: string,
  standing: PinSet,
): { knocked: PinSet; pins: number; foul: boolean };

export function rollSeed(gameSeed: string, seat: number, seq: number): string;
```

- `ballPath` is deterministic with no seed: the ball's track down the lane from aim, power and spin. Next draws it at once.
- `pinfall`:
  - `isFoul(timing)` true: `{ knocked: 0, pins: 0, foul: true }`.
  - Otherwise the entry point and angle from `ballPath` pick a pocket score; a seeded PRNG adds bounded scatter and pin-to-pin carry over the 10-pin layout. `pins` is the count of bits in `knocked`, and `knocked` is a subset of `standing`.
- PRNG: a small pure function such as sfc32, seeded by a string hash (cyrb128) of `rollSeed(...)`. No `crypto`, no `Math.random`, so Node and the browser compute the same numbers.
- Tuning targets, checked by a spec over 10,000 seeded deliveries: a perfect pocket hit (`aim` 17 or 23 with matching `spin`, `power` 0.7 to 0.9) strikes 45 to 65 percent of the time; a straight head-on hit strikes under 25 percent; `aim` 1 or 39 at low power is a gutter.

**Nest:**

- `lane_game.seed` is set when the game goes `live`: 32 bytes from `crypto.randomBytes`, base64url.
- `lane_roll` gains `knocked smallint` nullable (one migration). The standing set for a second ball is `FULL_RACK` minus the frame's first `knocked`; after a first-ball foul it is `FULL_RACK`.
- `POST /lanes/games/:id/rolls`, the player whose turn it is:
  - Body `RollDto`: `{ seq: number; aim: number; power: number; spin: number; timing: number }`, each validated to its range. `seq` must equal the player's next roll number, or 409 `ROLL_OUT_OF_ORDER`. This makes a double submit harmless.
  - Computes `pinfall(delivery, rollSeed(game.seed, seat, seq), standing)`, then calls API-22's `recordRoll` with `{ pins, foul }`, the input and `knocked`.
  - Answers 201 with `{ roll: { seq, pins, foul, knocked }, game: LaneGameResponse }`.
- Rate limit: 30 rolls a minute per user.
- `GET /lanes/games/:id` returns `seed` only once the game is `finished`, so anyone can replay and check every roll afterwards.

## Design notes

- **Nest is authoritative.** The client sends inputs. Nest computes and stores. The seed is secret until the game ends, so a client cannot search inputs for a guaranteed strike.
- **The preview needs no seed.** Next draws `ballPath` the moment the player releases. The ball takes about two seconds to reach the pins; Nest answers well inside that, and the pins fall to Nest's `knocked`. If the answer is late, the ball waits at the pins.
- **Deterministic and replayable.** Same seed, same inputs, same pins, on any machine. After the game, a "Check this game" link can re-run every roll in the browser.
- **The model is a game, not physics.** It is tuned to feel fair, not to match a real lane. Rapier physics for pins is WORLD-48's job and only decorates the result Nest already chose.

## Verification

Engine:

- `pinfall(d, s, FULL_RACK)` twice gives the same result.
- `knocked` is always a subset of `standing`; `pins` equals its bit count.
- `timing: 100.5`: `{ pins: 0, foul: true }`.
- Tuning targets above hold over 10,000 deliveries with fixed seeds.
- `rollSeed("abc", 1, 0) !== rollSeed("abc", 1, 1)`.

E2E:

- A live game, A's turn: `POST /rolls` with `seq: 0` and valid inputs answers 201 and a roll with `pins` 0 to 10.
- The same request again: 409 `ROLL_OUT_OF_ORDER`.
- `aim: 40`: 400. `power: 1.5`: 400. A body with `pins: 10`: 400 (unknown field).
- B posts on A's turn: 409 `NOT_YOUR_TURN`.
- `timing: 110`: the roll is a foul with 0 pins.
- Finish a game: `seed` appears; re-running `pinfall` with it and the stored inputs gives every stored `pins`.

## Done when

- [ ] `ballPath`, `pinfall`, `rollSeed`, `Delivery`, `PinSet` in `lane-engine`
- [ ] Tuning spec over 10,000 deliveries
- [ ] Seed set at `live`; `knocked` column migration
- [ ] `POST /lanes/games/:id/rolls` with `seq` check and rate limit
- [ ] Seed revealed only when finished
- [ ] Unit and e2e specs as listed
- [ ] `context/overview.md` Lane Night section covers the roll route and the seed
