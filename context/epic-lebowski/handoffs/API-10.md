# API-10: Trust the BFF's client IP for rate limits

- **Issue:** #44
- **Spec:** [issues/API-10.md](../issues/API-10.md)
- **Branch:** `44-api-10-trust-the-bffs-client-ip-for-rate-limits`. It doesn't match `feature/<id>-<slug>`, because `worktree branch --github` named it. Not renamed.
- **Blocked by:** none. It blocks AUTH-52 (#46), passwordless sign-in.
- **Status:** Finalizing

## Scope

Nest counts each visitor's rate limits by their own IP address, not the web server's. The web app sends two headers, `X-Bff-Secret` and `X-Client-Ip`, on every call to Nest. Nest trusts `X-Client-Ip` only when the secret matches `BFF_SECRET`. Otherwise it counts the caller's own address, as today. One visitor can no longer use up everyone's sign-in tries.

The story is kept small on purpose. On 2026-10-18 Craig set the direction: go passwordless next (AUTH-52), keep every service 100% free, and don't build what we will throw away.

## Decisions

One round of grilling, 2026-10-18. Craig took every recommendation.

- **Where Nest reads the secret: `throttle.config.ts`.** It gains `bffSecret`, and the guard takes `@Inject(throttleConfig.KEY)` as a 4th constructor argument. `rate-limit.e2e-spec.ts` already overrides that provider to turn throttling on, so it sets a test secret the same way.
- **Which header holds the visitor's IP: `x-real-ip`, then the first `x-forwarded-for` entry.** Vercel sets both and overwrites what the visitor sent. `next dev` fills `x-forwarded-for` with the socket address only when it is missing (`req.headers['x-forwarded-for'] ??= socket.remoteAddress` in `next/dist/server/base-server.js`). No new package. This changes the spec, which named only `x-forwarded-for`.
- **Host: Vercel Hobby, which is free.** Cloudflare's free Workers plan allows only 10 ms of CPU time per request, and server rendering needs more. No Cloudflare, SMS or Sentry in this story.
- **Both headers or neither.** The web app never sends an empty secret, or a secret without a valid IP. `BFF_SECRET` stays optional on both sides, so dev works without it.
- **`apiFetch` adds the pair itself.** It reads the incoming request with `headers()` from `next/headers`, so all 11 `apiFetch` calls get the pair and no caller changes. The `/api/bff` handler builds it from its own `request.headers` with the same helper. This changes the spec, which had each caller pass `extraHeaders`.
- **Departure, in the build: the trusted IP goes through `@nestjs/throttler`'s `normalizeIp`.** An IPv6 visitor is counted by their /64, and `::ffff:a.b.c.d` as `a.b.c.d`, the same as a caller who reaches Nest directly. Without it, one IPv6 visitor would get a fresh count from every address in their /64. qa-skeptic agreed in round 1.
- **Added in review (SEC-2): `BFF_SECRET` is 32 or more of `A-Z a-z 0-9 + / = _ -`, on both sides.** Nest won't start with any other value, and the web sends no pair with one. That covers base64, base64url and hex, so `openssl rand -base64 48` always fits. A secret with CR, LF or NUL would make `Headers` throw, and the error's cause could print it to a log.
- **No `auth-lesson` label.** No mentor lesson for this story.
- **For AUTH-52: drop passwords entirely.** No real members exist yet, so nothing needs a password fallback. Edit AUTH-52's spec and #46 when that story is planned.

## Gaps

| Gap                                                                                                                                           | How it was settled                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| AUTH-7 SEC-2: lockout by email through the shared BFF address                                                                                 | Closed by this story                                                                            |
| AUTH-8 SEC-3: the shared Nest rate-limit bucket until API-10                                                                                  | Closed by this story                                                                            |
| AUTH-9: one visitor can use up a member's 3 forgot tries                                                                                      | Closed by this story                                                                            |
| Spec reads only `x-forwarded-for`. On a host that adds to that header instead of overwriting it, the first entry is the visitor's own text    | `x-real-ip` first, then the first `x-forwarded-for` entry, in one function, `clientIpOf`        |
| Off Vercel (`next dev`, a self-hosted `next start`), a visitor can send their own `X-Forwarded-For`, and the BFF passes it on with the secret | Accepted limit. Vercel overwrites it. Written in `overview.md`                                  |
| The `IP_THROTTLER` count calls `super.getTracker` directly, so it would skip the trusted IP                                                   | The guard gets one `clientIp(req)`, used by both counts                                         |
| `refreshOnce` shares one Nest call between callers with the same refresh token, so Nest sees the first caller's IP                            | Accepted. The same token means the same member                                                  |
| No `next/headers` mock in the web specs defines `headers`                                                                                     | Task 2 adds it wherever the real `apiFetch` runs                                                |
| The bff route spec (lines 225-246) asserts Nest gets only `authorization` and `content-type`                                                  | Task 2 updates it: the pair is sent when `BFF_SECRET` is set. Browser headers are still dropped |

## Tasks

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                  | Files                                                                                                                                                                                                                                                                                                                     | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Depends on | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ |
| 1   | Nest trusts the pair. `BFF_SECRET` is optional, and at least 32 characters when set. `throttle.config.ts` gains `bffSecret`. The guard takes `@Inject(throttleConfig.KEY)` and gets one private `clientIp(req)`. It uses `x-client-ip` only when `x-bff-secret` has the same length as `bffSecret`, matches it under `crypto.timingSafeEqual`, and the IP passes `net.isIP(value) !== 0`. Otherwise it uses `super.getTracker(req)`. Both `getTracker` and the `IP_THROTTLER` branch of `handleRequest` use it. `.env.example` gains `BFF_SECRET=''` with the comment "Shared with apps/web. Lets Nest count rate limits by the visitor's IP, not the web server's." `context/overview.md` "Rate limits" gains a paragraph on the pair, and on the accepted limit off Vercel | fullstack-hooker-upper | `apps/api/src/config/env.validate.ts`, `apps/api/src/config/throttle.config.ts`, `apps/api/.env.example`, `apps/api/src/auth/auth-throttler.guard.ts` and its spec, `apps/api/test/rate-limit.e2e-spec.ts`, `context/overview.md`                                                                                         | Unit: the spec's 6 cases (match → `203.0.113.7`; match with body `walter` → `walter\|203.0.113.7`; match with `not-an-ip` → socket; wrong secret → socket; unset secret → socket; different length → no throw, socket), plus the IP count using the trusted IP. Env validation: a short `BFF_SECRET` stops startup, unset passes. E2E: override `{ enabled: true, bffSecret: <made-up 32+ chars> }`; six `POST /auth/token` with the secret and `198.51.100.1`, then one with `198.51.100.2`: the 6th is 429, the 7th 401. The same seven with no secret: the 7th is 429 | -          | Done   |
| 2   | The web app sends the pair. New `lib/bff-headers.ts` (`server-only`): `clientIpOf(headers)` reads `x-real-ip`, then the first `x-forwarded-for` entry, trimmed, and keeps it only if `net.isIP` accepts it. `bffHeadersFrom(headers)` returns `{ "X-Bff-Secret", "X-Client-Ip" }`, or `{}` when `BFF_SECRET` is unset or empty, or there is no valid IP. `apiFetch` merges `bffHeadersFrom(await headers())` after `extraHeaders`, so a caller can't replace them. Update the `extraHeaders` comment. The `/api/bff` route's `nestInit` adds `bffHeadersFrom(request.headers)`. `.env.example` gains `BFF_SECRET=` with a comment: server-only, never `NEXT_PUBLIC_`, and the same value as `apps/api`                                                                       | fullstack-hooker-upper | `apps/web/src/lib/bff-headers.ts` and its spec, `apps/web/src/lib/api.ts` and `api.spec.ts`, `apps/web/src/app/api/bff/[...path]/route.ts` and its spec, `apps/web/.env.example`, the `next/headers` mocks in the refresh, logout and logout-everywhere route specs, and in any other spec where the real `apiFetch` runs | `bff-headers.spec.ts`: `x-real-ip` wins; first XFF entry otherwise; spaces trimmed; `not-an-ip`, `1.2.3.4\|x` and empty give `{}`; no secret gives `{}`. `api.spec.ts`: the pair is sent; `extraHeaders` can't replace it; nothing is sent without the secret. bff `route.spec.ts`: Nest gets `authorization`, `content-type` and the pair, and nothing else the browser sent. Every existing web spec passes                                                                                                                                                            | -          | Done   |

Owners: `fullstack-hooker-upper`, `fe-tdd-dev`, `3d-animator`.

Tasks 1 and 2 share no file and can run at the same time.

## Reviewers

qa-skeptic, owasp-hacker and a11y-expert run on every story. Areas to look at
hard on this one:

- qa-skeptic: the `IP_THROTTLER` count uses the trusted IP, not the socket address. Both headers or neither, never one. `headers()` in `apiFetch` works in every context it runs in: Server Actions, Route Handlers and `getMe` in a Server Component.
- owasp-hacker: `X-Client-Ip` forged without the secret, a wrong secret, a secret of a different length, and `|` or other text in the IP. The secret must never reach the browser, a client bundle or a log. Self-hosted `X-Forwarded-For` spoofing is expected locally. It is an accepted limit, not a finding.
- a11y-expert: no UI changes. A quick pass.

## Verification

- Unit (`auth-throttler.guard.spec.ts`), the spec's six cases:
  - Secret matches, `X-Client-Ip: 203.0.113.7`: tracker is `203.0.113.7`.
  - Secret matches, body names `walter`: tracker is `walter|203.0.113.7`.
  - Secret matches, `X-Client-Ip: not-an-ip`: tracker is the socket address.
  - Secret wrong: tracker is the socket address.
  - `BFF_SECRET` unset, header present: tracker is the socket address.
  - Secret of a different length: no exception, falls back.
- E2E (`rate-limit.e2e-spec.ts`):
  - Six `POST /auth/token` with the secret and `X-Client-Ip: 198.51.100.1`, then one with `198.51.100.2`: the 6th gets 429, the 7th 401.
  - The same seven with no secret: the 7th gets 429.
- Web Vitest: the cases in Task 2.
- `pnpm lint`, both apps' unit suites, the API e2e suite, and `pnpm e2e:check` clean.
- By hand: put the same `BFF_SECRET` in `apps/api/.env` and `apps/web/.env.local`, sign in from the web app, and check that Nest's `X-RateLimit-*` counts follow the visitor's IP.

## Open questions

None.

## PR

**Title:** `API-10 (#44): Trust the BFF's client IP for rate limits`

**Body:**

Nest now counts each visitor's rate limits by their own IP address, not the web server's. One visitor can no longer use up everyone's sign-in tries.

### What the member can now do

Sign in, sign up and ask for a password reset with their own rate-limit counts. Another visitor's failed tries no longer lock them out.

### What changed

**API (`apps/api`)**

- New optional `BFF_SECRET`. When set, it must be 32 or more characters from `A-Z a-z 0-9 + / = _ -`. Nest won't start with any other value.
- `AuthThrottlerGuard` trusts the `X-Client-Ip` header only when `X-Bff-Secret` matches `BFF_SECRET` (compared with `crypto.timingSafeEqual`) and the IP passes `net.isIP`. Otherwise it counts the caller's own address, as before.
- Both the account-and-IP count and the IP-only count use the trusted IP.
- The trusted IP goes through `normalizeIp`, so an IPv6 visitor is counted by their /64 and `::ffff:a.b.c.d` as `a.b.c.d`, the same as a direct caller.
- `context/overview.md` "Rate limits" describes the header pair and its accepted limit.

**Web (`apps/web`)**

- New `lib/bff-headers.ts`. `clientIpOf` reads `x-real-ip`, then the first `x-forwarded-for` entry. `bffHeadersFrom` returns both headers, or none: it never sends one without the other.
- `apiFetch` adds the pair itself, so all 11 calls get it with no caller change. A caller can't replace it through `extraHeaders`.
- The `/api/bff` route adds the pair too. It still drops every other browser header.
- `BFF_SECRET` is server-only and never `NEXT_PUBLIC_`.

**Accepted limit.** Off Vercel (`next dev`, a self-hosted `next start`), a visitor can send their own `X-Real-Ip` or `X-Forwarded-For`, and the BFF passes it on. Vercel overwrites both. This is written in `overview.md` and in the spec.

**Departures from the spec**, approved by Craig: the web app reads `x-real-ip` before `x-forwarded-for`; `apiFetch` adds the pair itself; the secret has a character rule; and the /64 rule.

### Rendering strategy

None. No page or component changed.

### What the story teaches

No lesson. The issue has no `rendering-lesson` or `auth-lesson` label.

### Checks

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm build`: clean.
- Unit tests: API 1201 pass (69 files), web 1577 pass (81 files).
- API end-to-end: 371 pass (18 files).
- Web end-to-end: 42 pass, 72 skipped (the suite skips them itself), run on port 3101 because 3001 was in use.
- Migration drift: no changes. No migration in this story.
- `pnpm e2e:check`: clean.

### Review

Three rounds by qa-skeptic, owasp-hacker and a11y-expert. Round 3 had no findings. Nits and minors fixed in this PR: QA-1 (format of the handoff), QA-2 (the /64 rule written down), QA-3 and SEC-1 (docs name `X-Real-Ip`), SEC-2 (the `BFF_SECRET` character rule), QA-4 (spec text and issue #44 brought in line), QA-5 (a web spec row that could not test a NUL). Nits moved to later stories: none.

### Also in this PR: a simpler story flow

One commit, separate from API-10, replaces the planner and driver agents with two skills, `/plan-story` and `/implement`. Any chat runs them, in the terminal or in VS Code, so a story no longer needs `claude --agent`. The flow is `/plan-story`, `/clear`, `/implement`. A new `.claude/settings.json` turns off commit and PR attribution, and only the main chat may start agents. `AGENTS.md` describes the new flow.

Closes #44

## Log

- 2026-10-18: Planned. One grilling round. Craig set the direction: passwordless next, 100% free, keep this story lean.
- 2026-10-18: With Craig's yes: `issues/API-10.md` updated (`lib/bff-headers.ts`, `x-real-ip` then XFF, `apiFetch` adds the pair, the host limit) and mirrored to #44. Tracker row set to ⏳ In progress.
- 2026-10-18: Building. Task 1 started (fullstack-hooker-upper).
- 2026-10-18: Task 2 started (fullstack-hooker-upper), in parallel with Task 1. No shared files.
- 2026-10-18: Task 1 reported. Unit (99 in the guard and env specs), typecheck and lint pass, checked by the driver. API e2e not run: port 5432 is held by the `pg-pgdb` container from another project, so `dude-postgres` can't start. Asked Craig.
- 2026-10-18: Task 2 done. Web Vitest 81 files, 1569 tests pass (checked by the driver). Lint and typecheck clean.
- 2026-10-18: Postgres fixed. `pnpm db:up` from the worktree had named the compose project after the worktree folder, which made new empty volumes. Craig stopped create-pgbox. Brought the stack up with `docker compose -p dudesphere --env-file apps/api/.env up -d`, on the real `dudesphere_*` volumes.
- 2026-10-18: Task 1 done. API e2e 18 files, 371 tests pass, the new rate-limit cases included. `e2e:check` clean (the run's own after-step removed 100 users, 130 refresh tokens, 100 profiles, 13 abidings, 5 email tokens, 4 hashtags).
- 2026-10-18: Note for pr-finalizer, from Craig: the untracked `.agents/skills/plan-story/`, `.agents/skills/implement/`, `.claude/skills/plan-story`, `.claude/skills/implement` and `.claude/settings.json` are a separate workflow change. Leave them out of the API-10 commits. Craig adds one commit for them after Phase 2. Don't push yet.
- 2026-10-18: Reviewing. Round 1.
- 2026-10-18: Review servers up: web build on 3101, API on 5555, both with a made-up review `BFF_SECRET` from the shell (no `.env` change) and `THROTTLE_ENABLED=true`. Round 1: qa-skeptic, owasp-hacker and a11y-expert started.
- 2026-10-18: Round 1, a11y-expert: pass. No component, page, CSS or markup changed. The 429 sign-in message is unchanged.
- 2026-10-18: Round 1, owasp-hacker: pass, two nits. SEC-1: the accepted-limit docs name only X-Forwarded-For, not X-Real-Ip. SEC-2: a BFF_SECRET with CR, LF or NUL makes Headers throw, and the secret could reach a server log through the error's cause. Both fit this story; route to fullstack-hooker-upper with qa-skeptic's findings.
- 2026-10-18: Round 1, qa-skeptic: no code bugs. All Verification and Done-when lines pass, live too, `headers()` included in every context. QA-1 (blocker, driver): `format:check` fails on this handoff's tables. QA-2 (minor): the /64 departure is only in a code comment. QA-3 (minor, same as SEC-1): docs don't name X-Real-Ip. Not this story: `getMe` turns Nest's 429 into the generic error page; older than API-10.
- 2026-10-18: Round 1 cleanup: removed 1 user, 1 profile, 2 refresh tokens. `e2e:check` clean.
- 2026-10-18: Fix round 1 started (fullstack-hooker-upper): QA-2, QA-3/SEC-1, SEC-2. The driver added the /64 departure to Decisions and owns QA-1.
- 2026-10-18: Fix round 1 done. QA-1 fixed by the driver (oxfmt on this handoff). QA-2, QA-3/SEC-1, SEC-2 fixed by fullstack-hooker-upper: docs name X-Real-Ip and the /64 rule, and BFF_SECRET must be 32+ of letters, digits and + / = _ - on both sides. Checked by the driver: API unit 1201, web 1578, format:check clean, API e2e 371 pass, e2e:check clean.
- 2026-10-18: Rebuilt and restarted the review servers (3101, 5555). Round 2: qa-skeptic, owasp-hacker and a11y-expert started.
- 2026-10-18: Round 2, a11y-expert: pass. Still no UI file changed.
- 2026-10-18: Round 2, owasp-hacker: pass, no findings. SEC-1 and SEC-2 fixed; round 1 probes rerun with fresh IPs and all held; the secret is in no build file or log.
- 2026-10-18: Craig, for finalizing: commit only the API-10 files, in chunks (leave out the workflow files above). He approved one push of the branch. Do not open the PR: he adds a workflow commit first. Write the PR title and body into the PR section of this handoff.
- 2026-10-18: Round 2, qa-skeptic: pass. All round 1 fixes are real; the two secret rules agree on 26,004 test strings. QA-4 (minor, driver): four spec lines changed in the fix round, #44 still has the old text, and the Log has no yes from Craig for the spec edit. QA-5 (nit, fullstack-hooker-upper): the NUL row in `bff-headers.spec.ts` can't test a NUL, because `process.env` cuts at a NUL; proof file `bff-headers.qa.spec.ts`.
- 2026-10-18: Round 2 cleanup: removed 1 user, 1 profile, 1 refresh token. `e2e:check` clean.
- 2026-10-18: Added the SEC-2 secret rule to Decisions (QA-4). Asked Craig about the spec edits and #44. Fix round 2 started (fullstack-hooker-upper): QA-5.
- 2026-10-18: Craig said yes to keeping the four spec edits (secret rule, /64, X-Real-Ip). Mirrored the spec to #44 and read it back: it matches (QA-4 fixed).
- 2026-10-18: Fix round 2 done. QA-5 fixed: NUL row dropped from the web spec, comments made accurate, proof file deleted. Checked by the driver: web 1577 pass, format:check clean. Rebuilt and restarted 3101 and 5555. Round 3 started.
- 2026-10-18: Round 3, a11y-expert: pass.
- 2026-10-18: Round 3: qa-skeptic, owasp-hacker and a11y-expert all pass, no findings. QA-4 and QA-5 confirmed fixed. Review done after 3 rounds: 7 findings fixed (QA-1 to QA-5, SEC-1, SEC-2), none open.
- 2026-10-18: Note for pr-finalizer, from Craig: leave the uncommitted `apps/web/.gitignore` change (an extra `.env` line) out of the API-10 commits.
- 2026-10-18: Finalizing. Stopped the review servers. pr-finalizer started.
- 2026-10-18: pr-finalizer: all checks pass (lint, format, typecheck, build, API unit 1201, web unit 1577, API e2e 371, web e2e 42 pass / 72 skipped, migration:check, e2e:check). Commits 400c87d (API), 9088984 (web), b91e235 (docs). PR text written in the PR section. Craig said yes to one push via AskUserQuestion; pr-finalizer would not push on a relayed yes. Not pushed yet.
- 2026-10-18: Added the workflow commit (`/plan-story` and `/implement` skills) and its section in the PR body. Craig asked for the commit, push and PR in plain words.
