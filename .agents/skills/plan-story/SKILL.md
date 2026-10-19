---
name: plan-story
description: Plan one Lebowski epic story before any code is written. Resolves the story from the branch name, an issue number or an id, checks Blocked by, reads the spec, tracker and leftovers from earlier stories, grills the user in rounds, and writes the handoff that /implement builds from. Use when the user says "plan", "plan this story", "plan issue 44", "plan #44", "plan API-10" or "spec this out". Planning only. Building is /implement, after /clear.
---

# Plan a story

The main session runs this, in the story's worktree. Any chat can run it, in the terminal or in VS Code. You start the Explore agents you need yourself, and you ask the user yourself.

Planning ends with an approved handoff at `context/epic-lebowski/handoffs/<ID>.md`. You never write app code, tests or migrations. Your only outputs are the handoff and, with the user's yes, edits to specs, GitHub issues and the tracker.

## 1. Resolve the story

- **No argument:** read the branch with `git branch --show-current`.
  - `44-api-10-trust-the-…` (what `worktree branch --github` makes) gives issue `#44` and story `API-10`.
  - `feature/api-10-…` gives `API-10`.
  - The id is the `<letters>-<digits>` pair, upper-cased.
- **`44` or `#44`:** `gh issue view 44 --json title -q .title`. The title starts with the id.
- **`API-10`:** use it as given.

Find the row: `grep -n '\*\*<ID>\*\*' -A2 context/epic-lebowski/tracker.md`. Read the row only, not the whole tracker. If no row matches, ask which story is meant.

## 2. Gate

- Every story in the row's `Blocked by` cell is `✅ Done` in the tracker, and its code is on `main`. A row marked `In progress` is not done. If any blocker is open, stop and say which.
- If the row is `✅ Done`, stop and say so.
- If `handoffs/<ID>.md` already exists, show its Scope and Status, and ask whether to revise it or start over. Never overwrite a handoff silently.

## 3. Read

1. `AGENTS.md`
2. `context/epic-lebowski/index.md`: how stories, realms, labels and milestones work.
3. The Definition of Done at the end of `context/epic-lebowski/tracker.md`.
4. Leftovers from earlier stories (step 4 says where). Read these before the spec, because they can change it.
5. `context/epic-lebowski/issues/<ID>.md`: the spec. Some stories have none yet.
6. The GitHub issue: `gh issue view <n> --comments`. The tracker's Issue column maps ids to numbers.
7. `context/epic-lebowski/overview.md`: the decisions, the architecture, the risks.
8. `context/epic-lebowski/research.md`: the legal and IP caveats, before you approve any name or UI copy.
9. For a web story: `context/epic-lebowski/rendering-strategies.md`, `apps/web/src/content/lab.ts` and `context/standards/nextjs.md`.
10. The sections of `context/frontend-architecture.md` and `context/fullstack-architecture.md` that the spec links to.
11. `context/epic-lebowski/handoffs/README.md`: the handoff template.

Load a skill when a task needs its decision:

- `nextjs-app-architecture`: where web code lives, Suspense boundaries, `'use cache'`.
- `nestjs-best-practices`: modules, guards, data access.
- `domain-modeling`: only when the user asks for an ADR or a glossary entry.

## 4. Look for gaps

Find facts in the code yourself, or with Explore agents, so you never ask the user something you can look up.

- **Leftovers from earlier stories.** A finished story's PR often ends with nits, deferred findings, accepted limits and follow-ups.
  - Look in the `## PR` section and the Log of finished handoffs, and in PR bodies (`gh pr view <n> --json body`). Read at least:
    - every story in this story's `Blocked by` cell;
    - the story that finished most recently;
    - any handoff that names this story's id: `grep -n "<ID>" context/epic-lebowski/handoffs/*.md`.
  - Decide which of three cases each leftover is:
    - **It fits this story** (same files or feature, or a spec line says this story owns it): propose it as a task, or as a line in Scope, Verification or Done when.
    - **It belongs to another story:** propose the edit to that story's `issues/<ID>.md` and its GitHub issue.
    - **It has no home:** raise it with the user. It may need a new story, or the user may drop it.
  - List every leftover in the handoff's Gaps table, with how it was settled.
- **Spec.** `issues/<ID>.md` has Gap, Scope, Design notes, Rendering strategy, Verification and Done when. `issues/FEED-14.md` is the model. Draft one when it is missing.
- **API routes.** Every Nest route the web side calls exists in `apps/api/src` with the shape the spec expects. A missing route becomes a task here, or a new `API-` story if it is big.
- **Shared types.** Every response type the web side reads is in `packages/api-types`.
- **Clashes.** The spec doesn't contradict `overview.md`, the architecture docs or `AGENTS.md`.
- **Naming and copy.** Names and UI copy respect the caveats in `research.md`.
- **Definition of Done.** Each line maps to a task:
  - a migration for each Postgres change;
  - an `E2E_TARGETS` entry in `apps/api/test/e2e-cleanup.ts` for each new table or collection an e2e run writes to;
  - unit and e2e specs for backend work;
  - keyboard-only use and reduced motion for web work;
  - a `rendering-strategies.md` row and a `lab.ts` entry, with `lab.spec.ts` passing;
  - an `overview.md` update for any API change.

## 5. Grill

Follow the [`grilling`](../grilling/SKILL.md) method. Map the open decisions, ask the whole frontier each round, and stop when every branch is settled and the user agrees.

- Put each round to the user with `AskUserQuestion`: up to 4 questions a call, the recommended answer first with "(Recommended)" in its label. Never ask in prose.
- Word each question so that "yes" accepts your recommendation.
- Ask only about decisions.

## 6. Split the work into tasks

- Give each task one owner:
  - `fullstack-hooker-upper`: `apps/api`, `packages/api-types` and the BFF seam in `apps/web` (Route Handlers, `lib/session.ts`, Server Actions, `/api/bff` calls);
  - `fe-tdd-dev`: pages, components, client state, and their Vitest and Playwright specs;
  - `3d-animator`: CSS and `motion/react` animation, View Transitions and React Three Fiber.
- Give each task its files, the tests that prove it, and the tasks it depends on. API tasks come before the web tasks that call them.
- Two tasks that can run at the same time must not share a file.
- Don't plan reviewer tasks. `/implement` runs qa-skeptic, owasp-hacker and a11y-expert on every story. Do note where each reviewer should look hard.

## 7. Approve and write

1. Show the plan: the gaps, the decisions, the tasks and every file that will change. Write nothing until the user approves it. In plan mode, write the plan to the plan file and use `ExitPlanMode`.
2. Once approved, write `context/epic-lebowski/handoffs/<ID>.md` from the template, with `Status: Planned`.
3. Ask before you edit `issues/<ID>.md` or `tracker.md`. On a yes, make the spec edits, set the tracker row to `⏳ In progress`, and add any new story rows. A new story gets the next unused id. Ids never change.
4. Ask before you edit any GitHub issue, or another story's spec. An issue edit is public. On a yes:
   - edit that story's local `issues/<ID>.md` first;
   - then mirror it with `gh issue edit <n> --body-file <file>`, with links made absolute as the other issues have them;
   - log each edit in the handoff, with the issue number.
5. End with a short message: the gaps found, the leftovers picked up or moved, the decisions, the task count per owner, and then: "Run `/clear`, then `/implement`."

## Rules

The hard rules in `AGENTS.md` apply. The ones planning touches most:

- Write all prose in plain English, following the [`plain-english`](../plain-english/SKILL.md) skill.
- Look up library docs with `npx ctx7@latest` before you rely on memory.
- Test data uses made-up people at `example.com`, never a value from `.env` or from logs.
- Nothing is staged or committed. pr-finalizer makes every commit, under `/implement`.
- Pass agents paths, not pasted file content.
