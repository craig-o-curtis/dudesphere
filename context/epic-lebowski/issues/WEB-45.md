# WEB-45: Deploy to Vercel and a Docker host

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 5. Blocked by: API-10, AUTH-8, REPO-4.

**Scope:** The web app runs on Vercel, the API runs as the `apps/api` Docker image on Railway or Fly with Neon Postgres and a hosted MongoDB, and every env var, secret and production setting each side needs is set and documented.

## Gap

Everything so far runs on a laptop. Nobody else can use it. The production to-do from earlier work is still open: a database role that may create `citext`, `trust proxy` for the real proxy, and a real SMTP provider.

## Scope

**API host (Railway or Fly, decided in the story):**

- Build `apps/api/Dockerfile` from the repo root. Smoke-test the image locally first (`pnpm deploy --prod` behaviour, plan risk 6).
- Env: `PG_HOST`, `PG_PORT`, `PG_ADMIN_USER`, `PG_ADMIN_PW`, `PG_DATABASE` for Neon (with `sslmode=require`); `MONGO_URI` for MongoDB Atlas; `JWT_SECRET` (32+ characters); `FRONTEND_URL` (the Vercel domain); `BFF_SECRET`; `MAIL_*` for the real SMTP provider; `DUDE_OBSERVE_APP_KEY` and `DUDE_OBSERVE_APP_SECRET`; the AUTH-52 provider and WebAuthn vars.
- Neon: a role that may `CREATE EXTENSION citext`, or create the extension once by hand before the first migration. Run `migration:run` as a release step, not on boot. Migrations are append-only from the first Neon run.
- `main.ts` `trust proxy`: set to the host's proxy hop count (Fly and Railway each document one), from an env var `TRUST_PROXY`, default `loopback`.
- No CORS. The browser never calls the API. The API's public URL is known only to Vercel's server env.
- Health check on `GET /` (the app controller).

**Web (Vercel):**

- Project root `apps/web`, install from the repo root with pnpm, build `pnpm --filter @dudesphere/web... build`.
- Env: `API_URL` (the API host's URL), `BFF_SECRET`, `SITE_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (a fixed 32-byte base64 key, so Server Action ids stay valid across instances and deploys), `NEXT_TELEMETRY_DISABLED=1`.
- `next.config.ts`: `deploymentId` from `process.env.VERCEL_DEPLOYMENT_ID`, so old clients get a clean reload after a deploy instead of a skew error.
- Any page that reads runtime env in a self-hosted build calls `connection()` first; on Vercel that is not needed, and the rendering-strategies row records the difference.
- Node runtime only. No Edge.
- `poweredByHeader: false` in `next.config.ts`, which turns off `X-Powered-By: Next.js`.
- Behind a proxy, Next's Origin check trusts `X-Forwarded-Host`. The proxy must overwrite that header, not pass on the client's value.
- CSP: the root layout's inline theme script (WEB-6) can't be allowed by hash. The page carries six other inline scripts from Next, React and Turbopack (the `self.__next_f.push` flight payload and the `$RB` and `$RV` reveal scripts) that change with the build and each request, and under CSP Level 2 and later a hash in `script-src` makes the browser ignore `'unsafe-inline'`. Next's CSP guide says a nonce CSP doesn't work with Partial Prerender. Choose `'unsafe-inline'` with no hash, nonces that make every page dynamic, or another plan, and record the choice.

**Docs:**

- `DEVELOPMENT.md` gains "Deploying": both sides, every env var with its purpose, the migration step, and rollback (redeploy the previous image; never revert a migration on Neon by hand).
- `context/overview.md`: the production setup list moves from to-do to done.

## Design notes

- **Two hosts, one trust link.** Vercel calls the API with `BFF_SECRET`. The API trusts `X-Client-Ip` only with it (API-10).
- **Secrets never in the repo.** The env-leak hook (REPO-1) covers `apps/web/.env.local` too.
- **Real SMTP.** Mailpit is dev only. The provider must support a verified sender domain, or reset and magic-link emails land in spam.
- **Single-flight refresh across instances** (AUTH-8) is per instance. Watch the logs for "reused" after launch.

## Rendering strategy

No new page. The story records `connection()`: a self-hosted build must call it before reading runtime env such as `API_URL`, or the value is frozen at build time. On Vercel, env is available at build and run. `deploymentId` is the lesson's row for version skew between an open tab and a new deploy.

## Verification

- `docker build -f apps/api/Dockerfile .` and `docker run` with a local `.env` serve `GET /` and sign-in.
- After deploy: sign up, sign in, wait out the access token, refresh, post, reply, play a Lane Night frame, reset a password through the real mailbox.
- `curl` the API's public URL from outside without `X-Bff-Secret`: rate limits count the caller's own IP.
- Two Vercel deploys in a row: an open tab's next Server Action call reloads cleanly, not with an action-not-found error.
- `migration:run` on Neon succeeds once; a second run does nothing.

## Done when

- [ ] API image deployed on the chosen host with all env vars
- [ ] Neon and Atlas set up; `citext` available; migrations run as a release step
- [ ] `TRUST_PROXY` env and setting
- [ ] Web on Vercel with `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and `deploymentId`
- [ ] Real SMTP provider with a verified sender
- [ ] `DEVELOPMENT.md` "Deploying" section
- [ ] Manual flow above passes in production
