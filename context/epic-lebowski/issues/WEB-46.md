# WEB-46: Playwright flows and instant() navigation tests

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 5. Blocked by: AUTH-52, FEED-16, LANE-25.

**Scope:** Playwright drives the real browser through the app's main flows against both apps and both local databases, and `instant()` tests prove the key navigations render meaningful UI at once.

## Gap

Vitest covers pure functions and components, and the API has e2e suites, but nothing tests the two apps together in a browser: cookies, redirects, the refresh dance, the modal, the canvas. Those are where a regression would hurt most and show least.

## Scope

- `apps/web/playwright.config.ts`: `webServer` starts `pnpm --filter @dudesphere/api dev` and `pnpm --filter @dudesphere/web start` after a build; `baseURL: http://localhost:3001`; projects Chromium, WebKit and Firefox; a `reducedMotion: "reduce"` project on Chromium.
- `apps/web/e2e/fixtures.ts`: a fixture that signs up a fresh user with an `e2e-<random>@example.com` email and `e2e-<random>` username through the API, and stores the cookies as `storageState`. Hashtags are `e2e` plus 12 hex characters. The API's `test/global-setup.ts` cleanup removes them.
- Flows (`apps/web/e2e/*.spec.ts`):
  - `auth.spec.ts`: sign up, sign in by password, sign out; email link through Mailpit's API; a passkey with a virtual authenticator; refresh after expiry with `JWT_EXPIRES_IN=60`.
  - `feed.spec.ts`: infinite scroll, chips, compose with optimistic insert, reply.
  - `thread.spec.ts`: modal open and close keeps the feed's scroll; direct load renders the full page.
  - `lanes.spec.ts`: two users in two browser contexts play a frame each; a foul shows the stamp; the badge updates.
  - `admin.spec.ts`: forbidden for a member; restore a user as admin.
  - `a11y.spec.ts`: `@axe-core/playwright` on each main page, zero serious or critical violations.
- `instant()` tests with `@next/playwright` for the navigations that must feel instant: splash to `/login`, feed to thread modal, `/lanes` to a game. Each asserts the named element is visible on navigation, before data streams.
- CI: a `playwright` job with Postgres and Mongo services (as `e2e`), building both apps, running Chromium only on PRs and all three browsers nightly.

## Design notes

- **Never against the dev database with a guard off.** The API's route-access suite deletes for real when a guard is off; the same care applies here.
- **Real browser, real cookies.** No mocking of the BFF. Mail goes to Mailpit, read through its HTTP API.
- **The canvas is tested through the DOM.** The lane's results are DOM text with `aria-live`, so tests read those, not pixels.
- **Confirm `instant()`'s import and API in the Next 16.4 docs** before writing the tests.

## Rendering strategy

No new page. This story adds the lesson's testing row: Partial Prefetching and `instant()` prove which part of a route is in the static shell.

## Verification

- `pnpm --filter @dudesphere/web exec playwright test` passes locally on all projects.
- Break the refresh handler on purpose (return 500): `auth.spec.ts` fails. Revert.
- Wrap the feed's first card in a slow Suspense on purpose: the feed `instant()` test fails. Revert.
- The CI job passes on a PR and leaves no e2e rows after the API cleanup runs.

## Done when

- [ ] Playwright config, fixtures and the six flow specs
- [ ] `instant()` tests for three navigations
- [ ] axe checks with zero serious violations
- [ ] CI `playwright` job
- [ ] `DEVELOPMENT.md` explains how to run them
- [ ] Row added to `rendering-strategies.md`
