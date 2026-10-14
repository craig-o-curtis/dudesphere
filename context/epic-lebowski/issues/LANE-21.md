# LANE-21: Bowling scoring engine in packages/lane-engine

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Phase 2. Blocked by: none.

**Scope:** `packages/lane-engine` is a pure TypeScript package that turns a list of raw rolls into frames, frame scores and running totals under USBC rules, refuses impossible rolls, and handles fouls, with the USBC worked example and five more games as its test vectors.

## Gap

Lane Night (LANE-24), the Score Sheet (LANE-28), the leaderboard (ACHV-40) and every later bowling feature need one scoring engine that Nest and Next both run. Nest uses it to validate and store rolls; Next uses it to draw the scorecard before Nest answers. Two copies of the rules would drift, and bowling scoring has enough edge cases (the 10th frame, fouls, bonus balls) that drift is certain.

The setup branch may already hold a skeleton of this package with the test vectors (plan Part D, commit C5). This story owns the engine either way.

## Scope

**Package** (plan Part D.4):

- `packages/lane-engine/package.json`: name `@dudesphere/lane-engine`, `type: module`, `exports` pointing at `./dist/index.js` with `types` at `./dist/index.d.ts`. Scripts: `build` (`tsc -p tsconfig.build.json`), `dev` (`tsc --watch`), `typecheck`, `test` (`vitest run`).
- `packages/lane-engine/tsconfig.json` extends `../config/tsconfig.base.json`; `module: nodenext`, `declaration: true`, `outDir: dist`.
- `packages/lane-engine/vitest.config.ts` with `root: import.meta.dirname`.
- Built ESM, because Nest runs compiled JS with no bundler and `pnpm deploy` needs real files. Both apps depend on it with `workspace:*`. No tsconfig `paths`.
- No runtime dependencies. No `Date`, no `Math.random`.

**Types** (`src/types.ts`):

```ts
/** One delivery. `pins` is what fell on this ball; a foul always has 0. */
export interface Roll {
  readonly pins: number; // integer 0..10
  readonly foul: boolean;
}

export interface Frame {
  readonly number: number; // 1..10
  readonly rolls: readonly Roll[];
  readonly symbols: readonly string[]; // "X", "/", "-", "F", "1".."9"
  readonly kind: "strike" | "spare" | "open" | "incomplete";
  readonly score: number | null; // null until its bonus balls are thrown
  readonly runningTotal: number | null;
}

export type RollRefusal =
  | "pins-out-of-range" // not an integer 0..10
  | "foul-with-pins" // foul: true and pins > 0
  | "frame-over-ten" // frames 1..9: ball1 + ball2 > 10
  | "tenth-over-ten" // 10th: two balls on one rack > 10
  | "game-complete"; // any roll after the game ends
```

**Functions** (`src/index.ts`):

- `frames(rolls: readonly Roll[]): Frame[]`: splits rolls into frames and scores each. Frames 1 to 9 end after a strike or two balls. The 10th takes a third ball after a strike or a spare.
- `scoreGame(rolls: readonly Roll[]): { frames: Frame[]; total: number }`: `total` is the last non-null running total, 0 before any frame is scored.
- `validateRoll(rolls: readonly Roll[], roll: Roll): { ok: true } | { ok: false; reason: RollRefusal }`: whether `roll` may follow `rolls`. The plan calls the first argument `state`; the state is the rolls.
- `isComplete(rolls: readonly Roll[]): boolean`.
- `isFoul(timing: number): boolean` and `FOUL_LINE = 100`: the release meter runs 0 to 120; a release past 100 is over the line.

## Design notes

- **Store rolls, compute everything else.** Nest stores pins and a foul flag per roll. Frames, symbols, scores and totals are computed on every read. No stored totals.
- **A strike or spare frame shows no score until its bonus balls are thrown.** `score` and `runningTotal` are `null` until then.
- **10th frame.** A strike earns two bonus balls, a spare one. After a strike in the 10th the pins are reset, so up to three strikes. Bonus balls count only toward the 10th and never start a frame 11.
- **Fouls.** A foul is any body part over the line touching the lane during or after delivery. The delivery counts and pinfall is 0. The USBC guide is inconsistent on first-ball fouls; this engine follows common league practice: **after a first-ball foul all pins are respotted and the second ball is allowed, so "F /" is a spare.** The USBC worked example scores "F 9" as 9, which agrees.
- **Symbols.** Strike `X`; spare `/`; a 0 that is not a foul `-`; a foul `F`; otherwise the digit.
- **A game is 11 to 21 rolls.**
- **Rejection, not correction.** `validateRoll` never clamps. Nest answers 400 on a refusal.

## Verification

All vectors live in `packages/lane-engine/src/vectors.ts` and run in `scoreGame.spec.ts` and `validateRoll.spec.ts`. `X` is `{ pins: 10, foul: false }`, `F` is `{ pins: 0, foul: true }`.

**USBC worked example, 180.** Frames `X | X | X | 7 2 | 8 / | F 9 | X | 7 / | 9 - | X X 8`. Rolls: `10, 10, 10, 7, 2, 8, 2, F, 9, 10, 7, 3, 9, 0, 10, 10, 8`.

| Frame         | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10    |
| ------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ----- |
| Rolls         | X   | X   | X   | 7 2 | 8 / | F 9 | X   | 7 / | 9 - | X X 8 |
| Frame score   | 30  | 27  | 19  | 9   | 10  | 9   | 20  | 19  | 9   | 28    |
| Running total | 30  | 57  | 76  | 85  | 95  | 104 | 124 | 143 | 152 | 180   |

Frame 5 is 10 plus the next ball, the foul, which is 0. Frame 6 is 0 plus 9.

**More games:**

| Case                                   | Rolls                                                  | Total | Running totals      |
| -------------------------------------- | ------------------------------------------------------ | ----- | ------------------- |
| Perfect game                           | `10` twelve times                                      | 300   | 30, 60, 90, ... 300 |
| `9 -` every frame                      | `9, 0` ten times                                       | 90    | 9, 18, 27, ... 90   |
| `5 /` every frame, bonus 5             | `5, 5` ten times, then `5`                             | 150   | 15, 30, 45, ... 150 |
| All gutters                            | `0` twenty times                                       | 0     | 0, 0, ... 0         |
| Dutch 200 (strike, spare, alternating) | `10, 5, 5, 10, 5, 5, 10, 5, 5, 10, 5, 5, 10, 5, 5, 10` | 200   | 20, 40, 60, ... 200 |

**Partial games:**

- `[10]`: frame 1 `kind: "strike"`, `score: null`; total 0.
- `[10, 10]`: frames 1 and 2 null; total 0.
- `[10, 10, 10]`: frame 1 is 30; total 30.
- `[7, 3]`: frame 1 null. `[7, 3, 4]`: frame 1 is 14; frame 2 incomplete.
- `[F, 10]`: frame 1 is a spare, symbols `["F", "/"]`.
- `[F, 9]`: frame 1 is 9, symbols `["F", "9"]`.

**`validateRoll` refusals:**

| Rolls so far      | Next roll                 | Answer                                        |
| ----------------- | ------------------------- | --------------------------------------------- |
| `[]`              | `{ pins: 11 }`            | `pins-out-of-range`                           |
| `[]`              | `{ pins: -1 }`            | `pins-out-of-range`                           |
| `[]`              | `{ pins: 2.5 }`           | `pins-out-of-range`                           |
| `[]`              | `{ pins: NaN }`           | `pins-out-of-range`                           |
| `[]`              | `{ pins: 3, foul: true }` | `foul-with-pins`                              |
| `[7]`             | `4`                       | `frame-over-ten`                              |
| `[10, 5]`         | `6`                       | `frame-over-ten` (frame 2)                    |
| 18 zeros, `10, 7` | `4`                       | `tenth-over-ten`                              |
| 18 zeros, `3`     | `8`                       | `tenth-over-ten`                              |
| 18 zeros, `3, 4`  | `0`                       | `game-complete` (open 10th has no third ball) |
| `0` twenty times  | `0`                       | `game-complete`                               |
| `10` twelve times | `0`                       | `game-complete`                               |

**`validateRoll` acceptances:**

- 18 zeros, `10, 10` then `10`: ok (three strikes in the 10th).
- 18 zeros, `10, 7` then `3`: ok.
- 18 zeros, `3, 7` then `10`: ok (ball three is 0 to 10 after a spare).
- `[F]` then `10`: ok.

**`isComplete`:**

- `9, 0` ten times: false after 19 rolls, true after 20.
- `5, 5` ten times, then `5`: false after 20 rolls, true after 21.
- `10` twelve times: false after 11 rolls, true after 12.
- `10` nine times, then `0, 0`: true after 11 rolls, the shortest game.

**`isFoul`:** `isFoul(100)` false, `isFoul(100.01)` true, `isFoul(0)` false.

**Properties** (generated, 1,000 random valid games): every accepted sequence scores between 0 and 300; `scoreGame` of a complete game has ten non-null frame scores; `frames(rolls).flatMap(f => f.rolls)` equals `rolls`.

## Done when

- [ ] `packages/lane-engine` builds to `dist/` with types
- [ ] `frames`, `scoreGame`, `validateRoll`, `isComplete`, `isFoul` and the types above
- [ ] Every vector and refusal above passes; property test passes
- [ ] Root `pnpm test` runs the package's tests; CI `checks` covers it
- [ ] `apps/api` and `apps/web` list it as `workspace:*`
- [ ] `context/fullstack-architecture.md` names the package and its exports
