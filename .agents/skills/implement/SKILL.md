---
name: implement
description: Build one planned Lebowski epic story from its approved handoff to an open PR. A gate stops it until /plan-story has written the handoff. Sends each task to its builder, runs qa-skeptic, owasp-hacker and a11y-expert, gets the mentor's lesson when the issue asks for one, then has pr-finalizer commit and write the PR, and asks before the push. Use when the user types /implement in a story worktree.
disable-model-invocation: true
---

# Implement a planned story

The main session runs this, in the story's worktree. Any chat can run it, in the terminal or in VS Code. You start every agent yourself, and you are the only one who asks the user anything. No agent starts another.

You don't re-plan and you don't write code. You start the right agent for each task, check what comes back, keep the handoff's Log current, and stop when a gate needs the user.

## 1. Gate: nothing runs until the story is planned

- Find the story id from the branch, as `/plan-story` does: `44-api-10-…` or `feature/api-10-…` gives `API-10`. Or use the id the user named.
- Read the `Status` line of `context/epic-lebowski/handoffs/<ID>.md`:
  - no handoff, or a Status other than `Planned`, `Building`, `Reviewing` or `Finalizing`: stop, and say "Run `/plan-story` first." Don't plan inline, don't write a handoff yourself, and don't work around the gate;
  - `Done`: stop, and say "This story is done."
- Then read:
  1. `AGENTS.md`;
  2. the handoff: your work list;
  3. the spec, `context/epic-lebowski/issues/<ID>.md`;
  4. the Definition of Done in `context/epic-lebowski/tracker.md`.

## Your team

| Agent                    | Starts when                              | Does                                                                   |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| `fullstack-hooker-upper` | A task names it                          | Builds `apps/api`, `packages/api-types` and the BFF seam in `apps/web` |
| `fe-tdd-dev`             | A task names it                          | Builds pages and components, test first                                |
| `3d-animator`            | A task names it                          | Builds motion: CSS, `motion/react`, View Transitions, R3F              |
| `qa-skeptic`             | Every review round                       | Reviews standards and spec, and tries to break the work                |
| `owasp-hacker`           | Every review round                       | Reviews security against OWASP Top 10 and ASVS                         |
| `a11y-expert`            | Every review round                       | Reviews WCAG 2.2: keyboard, focus, names, motion                       |
| `mentor`                 | The issue has a lesson label             | Writes the story's TLDR lesson into `lessons/`, from the real code     |
| `pr-finalizer`           | All three reviewers pass, and the lesson | Runs every check, commits in chunks, writes the PR                     |

## 2. Build

- A new session picks up from the first task in the Tasks table whose status isn't `Done`. Read the Log too.
- Set the handoff Status to `Building`.
- Start every task whose dependencies are done. Run tasks in parallel only when their Files columns don't overlap. All agents share this one worktree.
- Give each builder a prompt with:
  - the story id and the task number;
  - the paths of the handoff and the spec;
  - the task row as written;
  - the files it owns for this task;
  - the tests that must pass;
  - in a fix round, the findings to fix, quoted in full.
- Ask each builder to report the files it changed, the tests it added and their result, anything left undone, and any seam it left for another agent.
- When a builder reports, check its claims. Run the tests it names. Look at `git status --short`. Mark the task `Done` only when its tests pass.
- Append one line to the Log for each start and finish. Get the date from `date -u +%F`.

## 3. Review

- Set the handoff Status to `Reviewing`.
- Before the reviewers start, build once with `pnpm --filter @dudesphere/web build`. Serve that build in the background with `next start -p 3101` from `apps/web`. Every agent shares one `.next` folder, so a second build breaks the server the others are testing. Tell each reviewer:
  - test against `http://localhost:3101`;
  - don't run `next build`, `pnpm build` or `test:e2e`, because the Playwright config builds too;
  - for a browser check, write a Playwright script that targets 3101 directly;
  - leave port 3001 alone, because the user's `pnpm dev:web` runs there.
- Start `qa-skeptic`, `owasp-hacker` and `a11y-expert` together on every story. Pass each one the handoff's notes for its area.
- A reviewer with nothing in its area says so in one line. That counts as a pass.
- Route each finding to the agent its report names:
  - fix every `blocker` and `major`;
  - fix a `minor` unless the owner gives a reason, which you log;
  - treat every `nit` as work too, because a PR carries no open nits. Route a nit that fits this story to its owner. Leave a nit that belongs to a later story for pr-finalizer, which moves it into that story's spec and GitHub issue. When pr-finalizer returns "Nits to fix", route them like any finding, then run the reviewers again.
- A reviewer may add a failing test that proves a finding. Send that file to the finding's owner along with the fix. The owner folds the test into the main spec for that code, or deletes it if the main spec already covers the case. No proof file gets committed on its own.
- When all three reviewers of a round have reported, wipe what they created: run `pnpm e2e:cleanup`, then `pnpm e2e:check`, which must pass. Never run the cleanup while a reviewer or a builder is still testing, because it removes their rows too. Log the counts it removed.
- After a fix round, rebuild, restart the server on 3101, and run all three reviewers again. A fix in one area can break another.
- After three rounds that still have a `blocker` or a `major`, stop. Show the user what is open and ask how to go on.

## 4. Lesson

- Read the issue's labels: `gh issue view <n> --json labels`.
- On `rendering-lesson` or `auth-lesson`, start `mentor` with the story id, the issue number, the handoff path and the labels. Keep its report for pr-finalizer.
- With neither label, skip this step and say so in the Log.

## 5. Finalize

- Set the handoff Status to `Finalizing`. Stop the review server on 3101, so the e2e run can use the port.
- Start `pr-finalizer`. Tell it that it runs under `/implement`, so it returns its questions rather than asking. Pass the mentor's report in full, or say there is no lesson, so it doesn't ask for the mentor.
- If a check fails, pr-finalizer returns the failure. Route it to the owner, then run the reviewers again on that fix.
- pr-finalizer stops and returns a question at two points:
  - before it rewrites commits that already exist;
  - before every push.
- Put each question to the user with `AskUserQuestion`. For a push, quote the PR title and body.
- On a yes, resume pr-finalizer with `SendMessage` and tell it what the user approved. If you can't resume it, start it again with that approval in the prompt.
- One yes covers one push. Ask again for any later push.

## 6. Hand back

- Check that pr-finalizer set the handoff Status to `Done` and logged the PR link. If it didn't, set them yourself.
- Send the user a summary:
  - the tasks done;
  - the review rounds and the findings fixed;
  - the nits fixed, and the nits moved to later stories, with their issues;
  - each check and its result.

## Rules

The hard rules in `AGENTS.md` apply to every agent you start. The ones this flow touches most:

- Write all prose in plain English, following the [`plain-english`](../plain-english/SKILL.md) skill.
- Never turn off a guard and then run e2e. The route-access suite would then delete real rows.
- Never `git push` yourself. pr-finalizer pushes, and only after the user's yes to that one push. Stage files by name. Never `git stash`, `git reset` or `git add -A`.
- Never write a `Co-Authored-By` trailer or a "Generated with" line.
- You never write app code, tests or migrations, and you never commit. You edit only the handoff.
- Pass agents paths, not pasted file content. Ask for short reports, not transcripts.
- One story per session. Run `/clear` between stories. A new session resumes from the handoff's Tasks and Log.
