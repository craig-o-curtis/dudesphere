# Staging and production setup

## Description

Dudesphere has no staging or production environment yet. This file is the
plan for one, with one hard rule: **every piece must be free**. No paid plan,
and no service that needs a card.

The recommendation:

| Piece                 | Service                                      | Staging               | Production            |
| --------------------- | -------------------------------------------- | --------------------- | --------------------- |
| `apps/web`            | Vercel Hobby                                 | preview deployments   | the `main` deployment |
| `apps/api`            | Vercel Hobby, as a second project            | preview deployments   | the `main` deployment |
| Postgres              | Neon free plan                               | its own Neon project  | its own Neon project  |
| Mongo                 | MongoDB Atlas, free cluster (M0)             | its own Atlas project | its own Atlas project |
| Password reset emails | Brevo free plan, Resend once we own a domain | the same account      | the same account      |

The free-tier figures below were checked on 2026-10-14. Free tiers change
often, so check each provider's pricing page before relying on a number.

The rest of [fullstack-architecture.md](./fullstack-architecture.md) still
holds. Two lines in
[epic-lebowski/overview.md](./epic-lebowski/overview.md) change if this plan
is taken up. See [What this changes in the plan](#what-this-changes-in-the-plan).

## Postgres: Neon

Stay on Neon. Supabase was weighed and turned down.

**Neon's free plan:**

- 100 compute-hours per project per month.
- Up to 2 compute units when busy, and scale to zero after 5 minutes idle.
  It wakes again in about a second.
- 10 branches per project, and up to 100 projects.
- Storage is 1 GB per project on Neon's own FAQ. Older copies of the FAQ and
  several other sites say 0.5 GB.
- 5 GB of public network transfer per project per month.

**Make staging and production two Neon projects, not two branches of one.**
The 100 compute-hours are per project. Branches of one project share them,
so a busy staging database would eat production's allowance.

**Why not Supabase.** Supabase's draw is its own auth, file storage and
generated data API. Nest owns both databases here, so we would use only its
plain Postgres. Its free plan is also worse for us:

- 500 MB per database, and only 2 active projects.
- A free project pauses after 7 days with no database activity, and stays down
  until someone restores it by hand. A quiet staging database would keep
  pausing.

## Mongo: MongoDB Atlas free cluster

There is no Mongo host yet. Use Atlas's free cluster, formerly called M0.

- 512 MB of storage and up to 500 connections. No card needed.
- Atlas allows one free cluster per Atlas project, so make two Atlas projects:
  `dudesphere-staging` and `dudesphere-production`.
- One third-party write-up says Atlas pauses a free cluster after 30 days with
  no connections. This was not confirmed in Atlas's own docs.

**The cost of a free host: no fixed IP address.** Vercel's free plan gives the
API no fixed outbound address, so Atlas's network access list must allow
`0.0.0.0/0`. The database password and TLS are then the only lock on the
door. Use a long random password, keep it only in the host's env settings, and
never put it in a commit or a log.

**Put everything in one region.** Choose the same region, such as AWS
`us-east-1`, for the Neon projects, the Atlas clusters and the Vercel
functions. Every API request talks to both databases, so a cross-region hop
adds up.

## The API host: Vercel Hobby

No free host is always on, needs no card and runs Docker. These were weighed:

| Host                               | Card needed | The catch                                                                                                              |
| ---------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby, Nest as one function | No          | No WebSockets in Nest. In-memory state is not shared between copies. Hobby is for personal, non-commercial use         |
| Render free web service            | No          | Sleeps after 15 minutes idle and takes about a minute to wake. 750 hours a month per workspace, shared by all services |
| Oracle Cloud Always Free           | Yes         | A real always-on VM, but we run the server ourselves: TLS, updates, restarts                                           |
| Google Cloud Run                   | Yes         | A generous free allowance, but a card on file                                                                          |
| Railway                            | —           | A trial with a one-time $5 credit, then $1 a month. Not a free host                                                    |
| Fly.io                             | —           | Free tier ended in 2024. Trial only, and a card is required                                                            |

**Vercel wins.** Vercel deploys NestJS with zero config: it finds
`src/main.ts` and runs the whole app as one Vercel Function, on Fluid compute.
That makes it the only option with no card and no minute-long wake-up.
Render's wake-up rules it out: the first visitor after a quiet spell would
wait about a minute, and the web app's call to the API would likely give up
first.

Vercel also gives staging for free. Each branch and PR gets a preview
deployment. Env vars scoped to Preview point it at the staging databases, and
env vars scoped to Production point `main` at the production ones.

**What running Nest on Vercel changes:**

- **Rate limits are approximate.** The throttler keeps its counts in memory.
  On Vercel, an instance can restart at any time, which resets them, and two
  instances keep two separate counts. That is acceptable for a hobby launch.
  A shared store, such as Upstash's free Redis, can come later.
- **`trust proxy` needs a new value.** `src/main.ts` sets it to `"loopback"`,
  which is right only for a proxy on the same machine. It is wrong on Vercel.
  This makes API-10's `X-Bff-Secret` and `X-Client-Ip` work more important,
  not less.
- **No WebSocket gateway.** A Vercel Function cannot hold a long-lived socket,
  so the Nest gateway planned for live lane rooms (LANE-49) cannot run there.
  LANE-49 is in the Later phase. Pick a host for the gateway then, such as
  Render or Oracle for the socket alone.
- **Shutdown hooks do little.** `app.enableShutdownHooks()` stays, but Vercel
  ends functions its own way.
- **The Dockerfile stays.** Nothing deploys from it for now, but it keeps a
  move to Render, Oracle or a paid host cheap.

**Not tested yet.** Nobody has checked that this pnpm workspace builds on
Vercel with `apps/api` as the project root and the workspace packages built
first. Do a throwaway deploy before committing to this plan.

## Email: Brevo, then Resend

Password reset emails need a real SMTP provider. Mailpit covers local dev only.

- **Brevo:** 300 emails a day. It can send from one verified address with no
  domain of our own. Its SMTP supports STARTTLS on port 587, which the mail
  provider needs: it requires TLS whenever `MAIL_USER` is set.
- **Resend:** 3,000 emails a month and 100 a day, with one verified domain.
  It needs a domain we own, and a domain costs money.

Use Brevo while there is no domain. Move to Resend if we buy one.

## Before the first deploy

These must be done before the first migration runs on Neon:

- [ ] **`citext`.** The initial migration runs
      `CREATE EXTENSION IF NOT EXISTS citext`. Neon supports it, and the
      project's owner role can create it. Run migrations as that role, or
      create the extension once by hand.
- [ ] **Migrations become append-only.** From the first Neon run, a migration
      is never edited or squashed again. Only new ones are added.
- [ ] **`FRONTEND_URL`.** Set it to the web app's real address in each
      environment. Password reset links are built from it, and its default is
      `http://localhost:3000`.
- [ ] **`MAIL_FROM`.** Set it to the verified sender address. Its default is a
      `dudesphere.local` address.
- [ ] **`MAIL_*`.** Point them at Brevo's SMTP server on port 587.
- [ ] **`trust proxy`.** Choose the value for Vercel.
- [ ] **`NODE_ENV=production`.** `@nestjs/authentication` then refuses to
      start if a feature has no registered store. `TypeOrmAuthenticationStore`
      covers sessions, refresh tokens and email tokens today.
- [ ] **Secrets.** `BFF_SECRET` (API-10) and
      `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (WEB-45) get a different value in
      staging and in production.

## What this changes in the plan

If this plan is taken up, update these lines:

- [epic-lebowski/overview.md](./epic-lebowski/overview.md), the Deploy row:
  "Nest in Docker elsewhere, on Railway or Fly" becomes "Nest on Vercel
  Hobby, as a second project".
- [epic-lebowski/overview.md](./epic-lebowski/overview.md), the Real-time
  section: the LANE-49 gateway needs a host of its own, because a Vercel
  Function cannot hold a socket.
- [fullstack-architecture.md](./fullstack-architecture.md), the Docker
  section: "The API image deploys to Railway or Fly, with Neon for Postgres"
  becomes a note that the image is kept for a later move.

## Sources

Checked on 2026-10-14.

- [Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas)
- [Supabase free tier limits and pausing](https://mykavo.app/blog/supabase-free-tier-limits)
- [Supabase pricing in 2026](https://uibakery.io/blog/supabase-pricing)
- [MongoDB Atlas service limits](https://www.mongodb.com/docs/atlas/reference/atlas-limits/)
- [MongoDB pricing](https://www.mongodb.com/pricing)
- [Hosting free tiers side by side, checked September 2026](https://flaviocopes.com/hosting-free-tiers/)
- [Render: platforms with a real free tier in 2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
- [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Resend free tier in 2026](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
- [Brevo vs Resend](https://agentdeals.dev/brevo-vs-resend)
