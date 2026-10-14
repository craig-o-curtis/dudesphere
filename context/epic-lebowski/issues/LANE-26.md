# LANE-26: Jesus taunt cards

Part of the Lebowski epic. See [index.md](../index.md). Realm: Lane. Phase 2. Blocked by: LANE-24.

**Scope:** A player can send one card from a curated set of flamboyant, clean taunts with each turn, and the opponent sees it on their next turn; no free text ever goes to another player.

## Gap

Async bowling is quiet. Rival energy is half the fun of the film's bowling scenes, and Bowling Friends shows canned taunts work. Free chat between strangers needs moderation the app does not have yet, so taunts must be a fixed set.

## Scope

**Nest:**

- `apps/api/src/lanes/taunts.ts`: the card set, 24 cards, each `{ id: string; text: string; tone: "brag" | "rib" | "salute" }`. Ids are short slugs such as `nobody-rolls`. Original text in the Jesus's flamboyant style, never his lines from the film. Examples of tone: "Did you just bowl a gutter on purpose? Bold.", "Feel that? That's the lane respecting me.", "Nice roll. For a warm-up."
- `GET /lanes/taunts`, Public: the card set.
- Table `lane_taunt` (one migration):

  | Column      | Type                                      |
  | ----------- | ----------------------------------------- |
  | `id`        | serial PK                                 |
  | `gameId`    | int FK `lane_game.id` `ON DELETE CASCADE` |
  | `fromSeat`  | smallint                                  |
  | `cardId`    | varchar(32)                               |
  | `createdAt` | timestamptz                               |

- `POST /lanes/games/:id/taunts`, player in the game: `{ cardId }`. The card must exist. One taunt per player per turn, or 409 `TAUNT_ALREADY_SENT`. 201.
- `LaneGameResponse` gains `taunts: { fromSeat, cardId, createdAt }[]`, the last 10.
- A member can mute taunts: `profile.tauntsMuted boolean default false` (same migration), set through `PATCH /profiles/me`. A muted member's game state returns no taunts from others, and nobody is told.

**Next:**

- `apps/web/src/components/lane/TauntDeck.tsx`: after a roll, a fan of six random cards from the set; pick one or "No taunt". Server Action `sendTaunt(gameId, cardId)`.
- `TauntBubble.tsx`: the opponent's card shows as a speech bubble from their side of the lane on the viewer's next visit, for 6 seconds or until dismissed.
- The card set is read through a `'use cache'` function with `cacheLife("days")` and `cacheTag("taunts")`.
- "Mute taunts" toggle on `/dudes/me`.

## Design notes

- **No free text to strangers.** Cards only. No custom card, no edits.
- **Flamboyant, clean.** No profanity, nothing sexual, nothing about the Jesus's backstory (avoid list). No film lines; the style is original.
- **The set lives in Nest.** Nest owns data; the web reads the set and caches it. A new card is a code change in Nest and a `revalidateTag("taunts", "max")` on deploy.
- **The card is the character, not the actor.** No likeness, no voice, no image of John Turturro.

## Rendering strategy

The card set is `'use cache'` with `cacheLife('days')`, the lesson's row for long-lived reference data. Sending is a Server Action from a client component.

## Verification

- `GET /lanes/taunts` lists 24 cards with unique ids.
- After A rolls, A sends `nobody-rolls`; B's next game read shows it; B's page shows the bubble.
- A second taunt in the same turn: 409 `TAUNT_ALREADY_SENT`.
- `cardId: "made-up"`: 400.
- B mutes taunts: B's game read shows no taunts from A.
- A non-player posting a taunt: 403.
- A content check: every card's text is under 80 characters and appears in a reviewed list in the spec.
- `lane_taunt` rows for e2e users are in the e2e cleanup.

## Done when

- [ ] 24 original cards in `taunts.ts`, reviewed against the avoid list
- [ ] `GET /lanes/taunts`, `POST /lanes/games/:id/taunts`, `lane_taunt` table, `tauntsMuted`
- [ ] `TauntDeck` and `TauntBubble`; mute toggle
- [ ] Unit and e2e specs as listed; cleanup updated
- [ ] `context/overview.md` Lane Night section covers taunts
- [ ] Row added to `rendering-strategies.md`
