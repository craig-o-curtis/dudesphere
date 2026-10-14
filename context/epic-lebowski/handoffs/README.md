# Handoffs

Each file here hands one story from the planner to the driver. The planner writes `<ID>.md`, such as `API-15.md`, once you approve its plan. The driver works from it and appends to its Log. pr-finalizer adds the PR body and the PR link. The file is committed on the story branch, so the PR shows how the story was built.

The spec in `../issues/<ID>.md` says what to build. The handoff says who builds which part, in what order, and what was decided on the way.

## Template

Copy everything below the line into `<ID>.md`.

---

```markdown
# <ID>: <story title>

- **Issue:** #<n>
- **Spec:** [issues/<ID>.md](../issues/<ID>.md)
- **Branch:** `<branch>`. Matches `feature/<id>-<slug>`: yes or no
- **Blocked by:** <each blocker and its status in tracker.md>
- **Status:** Planned | Building | Reviewing | Finalizing | PR open

## Scope

<Two or three sentences: what the member can do when this ships.>

## Decisions

<One line per decision from the grilling: the question, then the answer.>

## Gaps

| Gap | How it was settled |
| --- | ------------------ |
|     |                    |

## Tasks

| #   | Task | Owner | Files | Tests | Depends on | Status |
| --- | ---- | ----- | ----- | ----- | ---------- | ------ |
| 1   |      |       |       |       | -          | Todo   |

Owners: `fullstack-hooker-upper`, `fe-tdd-dev`, `3d-animator`.

## Reviewers

qa-skeptic, owasp-hacker and a11y-expert run on every story. Areas to look at
hard on this one:

- qa-skeptic: <...>
- owasp-hacker: <...>
- a11y-expert: <...>

## Verification

<The spec's Verification list, plus anything the grilling added.>

## Open questions

<Anything left for the driver to ask you. "None" when empty.>

## PR

<pr-finalizer writes the PR title and body here before it asks to push.>

## Log

<The driver appends one dated line per event: task started, task done,
finding raised, finding fixed, review round passed, PR opened. Dates come from
`date -u +%F`.>
```
