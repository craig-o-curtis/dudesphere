# Agent instructions

This is a pnpm workspace with two apps and some shared packages:

- `apps/api` is the NestJS API, `@dudesphere/api`. It has two databases: PostgreSQL through TypeORM and MongoDB through Mongoose. Keep it to those two. Do not add another ORM or data layer.
- `apps/web` is the web app, on Next.js 16.4 and React 19.3. It never touches a database. It calls the API. Style it with CSS Modules and CSS variables. Do not add Tailwind.
- `packages/*` holds code the apps share: `packages/config` (the shared tsconfig base), `packages/api-types` (the API's response types) and `packages/lane-engine` (bowling scoring).

Run an API script from the repo root with `pnpm --filter @dudesphere/api <script>`, for example `pnpm --filter @dudesphere/api migration:run`. The root `package.json` lists the scripts that run from the root, such as `pnpm dev`, `pnpm lint` and `pnpm db:up`.

`@northguild/gmt` and the zero-Date rule apply to `apps/web` as well as `apps/api`. Use gmt for every date, and never a JavaScript `Date`.

## Language

Ensure you use the plain-english skill for all prose, commit messages, PR titles, PR descriptions, and text displayed to me. See `.agents/skills/plain-english`.

## Context files

- overview: `./context/overview.md`
- coding-standards: `./context/coding-standards.md`. Rules for every task, and an index of the topic files in `./context/standards/`
- nextjs-standards: `./context/standards/nextjs.md`. Rendering strategies, `'use cache'`, parallel routes and intercepting routes in `apps/web`
- frontend-architecture: `./context/frontend-architecture.md`
- fullstack-architecture: `./context/fullstack-architecture.md`
- suggested-frontend-skills: `./context/suggested-frontend-skills.md`
- frontend-audit: `./context/audits/frontend-audit.md`. What to fix in `apps/web` (WEB-54)
- forms-analysis: `./context/audits/forms-analysis.md`. Why forms use Next.js form actions, not React Hook Form or TanStack Form

## Current epic

Epic Lebowski is the work in progress. Start at `./context/epic-lebowski/index.md`. `./context/epic-lebowski/tracker.md` tracks what is done and what is left.

## Skills

- nestjs-best-practices: `.agents/skills/nestjs-best-practices`
- plain-english: `.agents/skills/plain-english`
- code-reviewer-nestjs: `.agents/skills/code-reviewer-nestjs`
- grilling: `.agents/skills/grilling`. The interview that `grill-me` and the planner use
- domain-modeling: `.agents/skills/domain-modeling`. ADRs and the glossary, for `grill-with-docs`

For `apps/web` (see `./context/suggested-frontend-skills.md`):

- ui-composition: `.agents/skills/ui-composition`. Our own skill: shared parts in `src/components/ui/`, tokens, Base UI. `fe-tdd-dev` preloads it
- vercel-composition-patterns: `.agents/skills/vercel-composition-patterns`. Compound parts, explicit variants, no boolean props
- nextjs-app-architecture: `.agents/skills/nextjs-app-architecture`
- next-cache-components-optimizer: `.agents/skills/next-cache-components-optimizer`
- next-dev-loop: `.agents/skills/next-dev-loop`
- vercel-react-best-practices: `.agents/skills/vercel-react-best-practices`. Ignore its SWR rule (the app uses TanStack Query) and its memo rules (React Compiler is on)
- vercel-react-view-transitions: `.agents/skills/vercel-react-view-transitions`
- animate: `.agents/skills/animate`
- better-accessibility: `.agents/skills/better-accessibility`
- r3f-fundamentals: `.agents/skills/r3f-fundamentals`
- playwright-best-practices: `.agents/skills/playwright-best-practices`
- vitest: `.agents/skills/vitest`
- tanstack-query-best-practices: `.agents/skills/tanstack-query-best-practices`. Skip its SSR hydration rules: TanStack Query is for client lists only

## Agents

Ten agents build the epic one story at a time. Each one lives in `.agents/<name>.md`, with a link in `.claude/agents/` so Claude Code loads it.

| Agent                    | Does                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `planner`                | Reads the issue, spec and tracker, finds gaps, grills you, and writes the handoff                                |
| `driver`                 | Sends each task in the handoff to a builder, runs the three reviewers, then hands off to pr-finalizer            |
| `fullstack-hooker-upper` | Builds `apps/api`, `packages/api-types` and the BFF seam in `apps/web`                                           |
| `fe-tdd-dev`             | Builds pages and components in `apps/web`, test first                                                            |
| `3d-animator`            | Builds all motion: CSS, `motion/react`, View Transitions and React Three Fiber                                   |
| `qa-skeptic`             | Reviews standards and spec, and tries to break the work                                                          |
| `owasp-hacker`           | Reviews security against OWASP Top 10, on the local servers only                                                 |
| `a11y-expert`            | Reviews WCAG 2.2 AA, the keyboard and reduced motion                                                             |
| `pr-finalizer`           | Runs every check, commits in chunks, writes the PR, and asks before the push                                     |
| `mentor`                 | Writes the TLDR lesson a story teaches into `lessons/`, for stories labelled `rendering-lesson` or `auth-lesson` |

The flow for one story:

1. `worktree branch --github <issue>` makes the story's worktree.
2. `claude --agent planner` in that worktree plans the story with you. It writes `context/epic-lebowski/handoffs/<ID>.md`.
3. `claude --agent driver` in the same worktree builds, reviews and finalizes from the handoff.
4. To finish a story by hand, run `claude --agent pr-finalizer` on its own.

You don't have to launch the agents yourself. In an ordinary Claude session in the worktree, you can ask for the planner subagent. The session passes its questions on to you, and once you approve the plan, it drives the build itself by following `.agents/driver.md`. Don't run the driver as a subagent. A subagent can't start the builders or ask you questions.

The builders and reviewers never commit. pr-finalizer makes every commit, and asks before every push.

## Git

NEVER run `git push` without asking me first and getting a yes. This holds even when the task seems to need it, such as updating a PR. Approval covers that one push only. Ask again for the next one.

## Constraints

- Use NestJS
- Use Next.js for apps/web
- Use PostgreSQL
- Use TypeScript
- Use plain-english for all prose
