# The Lebowski epic: Dudesphere grows into The Big Lebowski

Dudesphere grows from a Twitter-like feed of abidings into a set of Big Lebowski
and Dudeism experiences. Lane Night anchors it: an async bowling game where
friends take turns a frame at a time, on the Words With Friends model. Around it
sit daily rituals, a profile identity built from the film's tenets, Achievers
groups that meet at real alleys, and a voice for the rules. The web app is a new
Next.js 16.4 app in `apps/web`, built as a lesson in every rendering strategy
Next offers. The NestJS API in `apps/api` keeps the data.

This file is the entry point. Read what you need.

## What to read, in order

1. [overview.md](overview.md): the decisions, the architecture, what is out of
   scope, the risks, and the corrections to the previous plan. **The entry
   file.**
2. [research.md](research.md): Dudeism, the film, Lebowski Fest, the glossary,
   the legal and IP caveats, and the USBC bowling scoring rules with test
   vectors. **Read the legal caveats before naming any feature.**
3. [experiences.md](experiences.md): the 26 experiences that were weighed, the
   MVP bundles, the avoid list, and the parked list.
4. [rendering-strategies.md](rendering-strategies.md): every Next and React
   rendering strategy, and the route and story that teach it.
5. [tracker.md](tracker.md): every story in build order, its `Blocked by` cell,
   its GitHub issue, and the Definition of Done.
6. [issues/](issues/): one spec per story, named by story id.
7. [../suggested-frontend-skills.md](../suggested-frontend-skills.md): agent
   skills worth installing for the web work, and the ones to avoid.
8. [../frontend-architecture.md](../frontend-architecture.md): the web app's
   layout, auth, pages, motion and the World plan.
9. [../fullstack-architecture.md](../fullstack-architecture.md): the workspace,
   scripts, shared packages, CI and Docker.

## The two rules behind every story

**1. Nest owns both databases.** Every row is written by `apps/api`: Postgres
through TypeORM, Mongo through Mongoose. Next is the backend for the frontend
and the presentation layer. It holds cookies, renders pages, caches public
reads, and draws images. It never writes a database row. Keep to TypeORM and
Mongoose: no third ORM and no other data layer, in either app.

**2. Plain English for all prose, and `@northguild/gmt` for every date.** Specs,
commit messages, PR text and UI copy follow
[the plain-english skill](../../.agents/skills/plain-english/SKILL.md): lead
with the outcome, one idea per sentence, active voice, concrete names. Code in
every app and package uses `@northguild/gmt` for every date, validation
included, and never a JavaScript `Date`. The root oxlint config enforces it.

## How to pick up a story

1. Open [tracker.md](tracker.md). Take the first story whose status is not Done.
   Check its `Blocked by` cell; an unfinished blocker comes first.
2. Read `issues/<ID>.md`, such as `issues/FEED-12.md`. Read the sections of
   `overview.md` and `research.md` that it links.
3. Branch from `main` with `feature/<id-lowercase>-<slug>`, such as
   `feature/feed-12-splash` or `feature/lane-21-lane-engine`.
4. Set the row's Status to In progress in `tracker.md`.
5. Build it. A web story adds or updates its row in
   [rendering-strategies.md](rendering-strategies.md).
6. Meet the Definition of Done in `tracker.md`. Then set the row to Done.
7. Put `Closes #<issue>` in the PR description, so merging the PR closes the
   GitHub issue. Check the issue closed after the merge.

The agents in `.agents/` run these steps for you. `worktree branch --github
<issue>` makes the branch. The `planner` agent covers steps 2 and 4, and writes
a handoff to [handoffs/](handoffs/). The `driver` agent covers steps 5 and 6.
`pr-finalizer` covers step 7. The worktree tool names branches its own way, so
the branch may not match step 3. See the Agents section of `AGENTS.md`.

## How issues are named

Each story is `<REALM>-<n>: noun phrase`, such as
`FEED-16: Thread page and intercepting-route modal`. The title names a thing,
not an action.

A story's PR title is `<ID> (#<issue>): <name>`, with the id and name copied
from the GitHub issue, such as `ACHV-51 (#86): Fest Finder and Day of the Dude`.
The PR copies the issue's labels and milestone.

The numbers form one sequence across every realm. An id never changes once it is
written, even when a story moves phase or splits. A split adds a letter, such as
AUTH-52a. The ids do not match GitHub issue numbers; the tracker's Issue column
maps one to the other. The build order is the order of the tracker's rows, not
the order of the ids. AUTH-52, for example, was added last and builds first in
Phase 1.

### Realms

| Realm    | Covers                                                                    |
| -------- | ------------------------------------------------------------------------- |
| `REPO`   | the workspace, shared packages and CI                                     |
| `WEB`    | the Next app's shell, design tokens, SEO, the `/lab` page, deploy, tests  |
| `AUTH`   | sign-up, sign-in, sessions and the BFF cookies, on both apps              |
| `FEED`   | abidings: the splash, feed, threads, dude pages, admin, the Caucasian Bar |
| `API`    | backend work in `apps/api`: new tables, routes and gaps the web app needs |
| `LANE`   | Lane Night: the engine, the lane, turns, taunts, the ticker, Score Sheet  |
| `ABIDE`  | daily rituals: check-ins, the Take-It-Easy timer, Shomer Shabbos mode     |
| `RUG`    | identity: the Rug theme, the quiz, the certificate, Ask the Stranger      |
| `ACHV`   | Achievers groups, Bowling Nights, Fest Finder                             |
| `MOD`    | Walter's Rules moderation                                                 |
| `WORLD`  | the 3D world, after the MVP                                               |
| `SPHERE` | the globe and opt-in coarse location, after the MVP                       |

### GitHub milestones

One milestone per phase: `Phase 0: Foundation`, `Phase 1: The Feed`,
`Phase 2: Lane Night`, `Phase 3: Rituals and identity`, `Phase 4: Achievers`,
`Phase 5: Polish and deploy`, and `Later`.

### GitHub labels

| Label              | Goes on                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `epic-lebowski`    | every story in this epic                                                                                                 |
| `web`              | stories that change `apps/web`                                                                                           |
| `api`              | stories that change `apps/api`                                                                                           |
| `fullstack`        | stories that change both apps, in place of `web` and `api`                                                               |
| `packages`         | stories that change `packages/*`                                                                                         |
| `backend-gap`      | API work the web app found it needs                                                                                      |
| `rendering-lesson` | web stories that add a row to `rendering-strategies.md`; the mentor writes their lesson in `lessons/rendering-lesson.md` |
| `auth-lesson`      | stories that teach authentication or authorization; the mentor writes their lesson in `lessons/auth-lesson.md`           |
| `enhancement`      | new behavior, as before the epic                                                                                         |
| `documentation`    | docs-only stories, as before the epic                                                                                    |

Each issue body starts "Part of the Lebowski epic. See
`context/epic-lebowski/index.md`. Realm: X." The spec from `issues/<ID>.md`
follows.
