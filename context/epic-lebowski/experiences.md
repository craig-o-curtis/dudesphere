# Experiences: what Dudesphere could be

This document lists 26 candidate experiences for Dudesphere, sized and sorted, and records which ones make the MVP. A developer can pick a row and build from it with `research.md` beside it.

Written on 2026-10-14.

## Key

| Code | Meaning   |
| ---- | --------- |
| RT   | Real-time |
| A    | Async     |
| S    | Small     |
| M    | Medium    |
| L    | Large     |

## Decision

On 2026-10-14 Craig picked all four MVP bundles, with Lane Night as the anchor. The bundles are listed under "The MVP bundle" below.

## The 26 experiences

| #   | Experience                           | Pitch                                                                                                                                               | Why it fits                                                               | Size                                                    | RT/A | Data needs                                       | MVP?                                                            |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ---- | ------------------------------------------------ | --------------------------------------------------------------- |
| 1   | Lane Night (async bowling)           | Turn-based 10-frame game against friends. One frame, or the whole game, per turn. Push notification says "Phone's ringing, Dude"                    | Bowling is the film's center. Async copies the Words With Friends loop    | L (M with a 2D lane and a simple server-side pin model) | A    | games, players, rolls[], turn state, server seed | Yes, the anchor                                                 |
| 2   | "Over the line!" foul                | Release-timing meter. Overstep = foul. The delivery counts, 0 pins, red "MARK IT ZERO" stamp                                                        | Iconic scene. Matches the real USBC foul rule                             | S (on top of 1)                                         | A    | foul flag per roll                               | Yes                                                             |
| 3   | Real-world score log ("Score Sheet") | Enter frame-by-frame scores from a real alley. Auto-totals. Posts as an abiding                                                                     | Same scoring engine, so it is cheap. Links the app to real bowling nights | S                                                       | A    | games(source=real), alley, rolls                 | Yes                                                             |
| 4   | "Mark it zero" dispute               | Teammates can contest a logged real score. A vote resolves it. The ruling posts with Walter copy                                                    | Turns a film gag into trust and moderation for self-reported scores       | S-M                                                     | A    | disputes, votes                                  | v1.1                                                            |
| 5   | Leagues                              | 3-4 person teams with Dude, Walter and Donny roles. Weekly matchups, standings, seasons                                                             | The trio is a league team. Jesus is the rival team                        | M                                                       | A    | leagues, teams, schedule, standings              | v1.1 (a minimal "league = group + leaderboard" can ship in MVP) |
| 6   | Bowling Night scheduler              | Create real-world bowling meetups. RSVP, check in, and log scores to the event                                                                      | Real-world social glue, in the Lebowski Fest style                        | S-M                                                     | A    | events, RSVPs, location                          | Yes (with groups)                                               |
| 7   | Live Lane (real-time room)           | 2-6 players share a lane over websockets. Spectators throw reactions                                                                                | The party feel of the fest bowling party                                  | L                                                       | RT   | rooms, presence, socket events                   | Post-MVP                                                        |
| 8   | Daily "The Dude abides" check-in     | One tap plus an optional one-line mood. Soft streaks with no shaming ("strikes and gutters")                                                        | Core Dudeist practice. A daily habit hook                                 | S                                                       | A    | checkins(user, date, mood)                       | Yes                                                             |
| 9   | Take-It-Easy timer                   | 1-10 minute calm timer with a breathing prompt. Finishing posts "abided for 5 min"                                                                  | Dudeism is Taoist take-it-easy                                            | S                                                       | A    | sessions                                         | Yes                                                             |
| 10  | Tumbling Tumbleweeds ambient mode    | Idle screen: drifting tumbleweed, slow feed, muted counts, original ambient audio                                                                   | The opening shot and the Stranger's mood                                  | S                                                       | A    | client only                                      | Yes, cheap                                                      |
| 11  | Caucasian Bar (recipe abidings)      | Structured recipe post: vodka, coffee liqueur, cream, half-and-half or "powdered emergency". Variants, a "Cheers" reaction, a 21+ gate              | The sacramental beverage. Duderonomy's creamer law                        | S-M                                                     | A    | recipe schema, age attestation                   | Yes (as a post type)                                            |
| 12  | Laws of the Lane quiz                | Onboarding quiz on original tenets. Gives a "Dudeist alignment": Dude, Walter, Donny or Maude                                                       | Duderonomy-style canon with personality-quiz shareability                 | S                                                       | A    | quiz content, results                            | Yes                                                             |
| 13  | Lane Certificate (ordination parody) | Shareable "Certified Abider of Dudesphere" certificate after the quiz plus 7 check-ins. Links out to dudeism.com for real ordination                | Ordination is a key Dudeist ritual                                        | S                                                       | A    | cert render (SVG/OG image)                       | Yes, carefully named                                            |
| 14  | Ask the Stranger                     | Ask a question and get a cowboy-narrator aphorism ("A wiser fella than myself once said..."). Curated original lines, or an LLM with a style prompt | The Stranger is the film's wisdom voice                                   | S curated / M LLM                                       | A    | wisdom corpus                                    | Yes (curated)                                                   |
| 15  | The Rug                              | Profile theme with procedurally generated rug patterns and palettes. It "ties the room together" when the profile is complete                       | The film's MacGuffin                                                      | S-M                                                     | A    | theme config                                     | Yes                                                             |
| 16  | Achievers groups                     | City or interest chapters with a group feed and leaderboard                                                                                         | The fan name. The Lebowski Fest community                                 | M                                                       | A    | groups, memberships                              | Yes (simple)                                                    |
| 17  | Fest Finder                          | User-submitted Lebowski Fests, Day of the Dude parties and screenings. Map and calendar                                                             | Real fests still run (Achiever Fest, Moscow ID)                           | M                                                       | A    | events, geo, moderation                          | v1.1                                                            |
| 18  | Day of the Dude (Mar 6) event        | Annual global tournament, limited badge, bathrobe cosmetic                                                                                          | Dudeism's high holy day                                                   | M                                                       | A/RT | seasonal config                                  | Plan for the first March                                        |
| 19  | Finish the Line                      | Quote-completion quiz, as on the Blu-ray. User-submitted questions. Short excerpts only                                                             | Fans quote it constantly                                                  | S                                                       | A    | question bank                                    | Optional (keep excerpts tiny)                                   |
| 20  | Shomer Shabbos mode                  | Weekly quiet window: no push, no game turns due, clocks paused. The user picks the day. Saturday is only a suggestion                               | Walter's Sabbath refusal. Humane notifications                            | S                                                       | A    | user quiet schedule                              | Yes (cheap, beloved)                                            |
| 21  | Nihilist mode                        | Toggle: random feed order, hidden counts, "We believe in nothing" theme, Autobahn easter egg                                                        | Turns the villains into a playful opt-in                                  | S                                                       | A    | client flag                                      | Optional fun                                                    |
| 22  | The Jesus trash talk                 | Curated pre-match taunt cards, flamboyant but clean. No free text to strangers                                                                      | Iconic rival energy, kept safe                                            | S                                                       | A    | card set                                         | Yes (with #1)                                                   |
| 23  | Walter's Rules moderation            | Guidelines titled "There are rules". Mod actions: Over the line (warning), Mark it zero (removed), "Calmer than you are" pre-post nudge             | Gives moderation a voice                                                  | S                                                       | A    | mod actions, reasons                             | Yes (copy and states)                                           |
| 24  | Larry's Homework (weekly mystery)    | Weekly noir puzzle "case file" with clues hidden across the app. "Lotta ins, lotta outs"                                                            | The detective-noir plot                                                   | M                                                       | A    | puzzle content, progress                         | Post-MVP                                                        |
| 25  | Creedence Tape Deck                  | Share playlist links (Spotify, Apple) as "tapes". No hosted audio                                                                                   | The Dude's tapes. Music bonding                                           | S                                                       | A    | link previews                                    | Optional                                                        |
| 26  | Gutterballs reel                     | Weekly auto-compiled funniest misses and fouls from Lane Night                                                                                      | The dream sequence. Celebrates failure                                    | S-M                                                     | A    | game events                                      | v1.1                                                            |

## Avoid

- Donny's coffee-can and ashes jokes. They touch grief.
- The toe gag. It is gore.
- The Jesus's backstory and Walter's National Socialism line.
- Any feature named "Where's the money, Lebowski?". That is the licensed game's title.

## The MVP bundle

All four bundles ship in the MVP. They share one scoring engine and one event model.

| Bundle             | Experiences                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bowling            | Lane Night (#1) with the Over-the-line foul (#2) and the Jesus taunt cards (#22). Real-world Score Sheet (#3) and the Bowling Night scheduler (#6)                    |
| Community          | Achievers groups (#16)                                                                                                                                                |
| Daily practice     | Daily abide check-in (#8), Take-It-Easy timer (#9), Caucasian recipe post type (#11), The Rug profile theme (#15)                                                     |
| Identity and voice | Laws of the Lane quiz (#12), Lane Certificate (#13), Ask the Stranger with curated lines (#14), Shomer Shabbos quiet mode (#20), Walter's Rules moderation copy (#23) |

Lane Night is the anchor. The scoring engine from `research.md` serves Lane Night, the Score Sheet and every later bowling feature.

## Lane Night design notes

### Input

- Aim: lane board 1 to 39.
- Power.
- Spin.
- A release-timing meter. Overstep = foul.

### Server-authoritative

Pinfall is computed server-side from the input plus a server seed. Clients cannot fake strikes.

### Async model

Two options:

- One frame, which is 2 rolls, per turn.
- A "ghost" mode where each player plays the full game on the same seed.

### Parallel games

Allow many games at once. The Words With Friends coverage names this as the main retention driver.

### Precedents

| Game                      | What to borrow                               |
| ------------------------- | -------------------------------------------- |
| Bowling Friends           | Turn-based play with canned taunts           |
| Moji Bowling for iMessage | Swipe, then send the result                  |
| Miniclip's Bowling King   | The real-time 1v1 model, for Live Lane later |

### Timeouts

Use a turn timeout, for example 72 hours. Resolve it gently with "The Dude abides; game paused" instead of a hard forfeit.

## Parked

Researched, deliberately unscheduled. Do not re-propose without new evidence.

| Experience                                  | Reason                                           |
| ------------------------------------------- | ------------------------------------------------ |
| Larry's Homework (#24)                      | Weekly mystery is content-heavy. Post-MVP        |
| Nihilist mode (#21)                         | A fun toggle with no retention value yet         |
| Gutterballs reel (#26)                      | Needs a body of game events first                |
| Creedence Tape Deck (#25)                   | Link previews only, low value                    |
| Finish the Line (#19)                       | Quote excerpts carry IP risk                     |
| "Mark it zero" dispute votes (#4)           | Needs real-score volume first                    |
| Tumbling Tumbleweeds ambient mode (#10)     | Cheap but cosmetic. Revisit with the World phase |
| Live Lane real-time rooms (#7)              | After the MVP, through a Nest WebSocket gateway  |
| Fest Finder (#17) and Day of the Dude (#18) | Plan for the first March after launch            |
