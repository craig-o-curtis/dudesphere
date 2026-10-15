# FEED-19: Admin users and hashtags tables

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 1. Blocked by: WEB-5, API-18.

**Scope:** `/admin/users` and `/admin/hashtags` let an admin list, soft-delete and restore users and hide and restore tags, behind `forbidden()` for everyone else, with an audit line written after each action.

## Gap

Admins can manage users and hashtags only through curl. The web app has no admin area. This is also the lesson's row for `forbidden()` with `experimental.authInterrupts` and for `after()`.

## Scope

- `apps/web/next.config.ts`: `experimental.authInterrupts: true`.
- `apps/web/src/app/(app)/admin/layout.tsx`: no auth check (layouts never check auth). A nav with "Users" and "Hashtags".
- `apps/web/src/app/(app)/admin/forbidden.tsx`: "There are rules, and this room is one of them." with a link to `/feed`.
- `apps/web/src/lib/session.ts` gains `requireAdmin()`: calls `getMe()`; no session redirects to `/login?next=`; a role other than `admin` calls `forbidden()`.
- `apps/web/src/app/(app)/admin/users/page.tsx`:
  - `requireAdmin()` inside Suspense.
  - Nest `GET /users?limit=50&page=N` (Admin). Columns: id, username, email, display name, role, created, status.
  - Deleted rows are greyed, with a "Restore" button: Server Action `restoreUser(id)` calls `POST /users/:id/restore`.
  - Live rows have "Close account": a confirm dialog, then `deleteUser(id)` calls `DELETE /users/:id`.
- `apps/web/src/app/(app)/admin/hashtags/page.tsx`:
  - `requireAdmin()` inside Suspense.
  - API-18's admin list with a `state` filter (All, Live, Hidden).
  - "Hide" calls `DELETE /hashtags/:slug`; "Restore" calls `POST /hashtags/:slug/restore`. Both `updateTag("hashtags")`.
- Every admin action re-checks with `requireAdmin()` and, after the response is sent, logs one audit line with `after()`:

  ```ts
  after(() => console.info(JSON.stringify({ audit: "user.restore", adminId, targetId, at })));
  ```

  `at` comes from gmt.

- Tables: plain `<table>` with `<caption>`, `<th scope>`, and buttons labelled with the row ("Restore user 42"). Paging uses `links.next` and `links.previous` as plain links.

## Design notes

- **`forbidden()` is the convenience, Nest is the guard.** Nest enforces the role on every call; a member who lost admin gets 403 from Nest on the next request, with the same token.
- **The role comes from `getMe()`,** never from the token, which carries no role.
- **`after()` runs once the response is sent,** so logging never slows the admin down.
- **Row animations** are 150 ms with `@starting-style`; under reduced motion rows just appear.
- **Usernames are fine here.** Admins may see them.

## Rendering strategy

Dynamic: both pages read the session inside Suspense. `forbidden()` behind `experimental.authInterrupts` renders `forbidden.tsx` with a 403 status. `after()` writes the audit line after the response. Server Actions do the writes.

## Verification

- As the seeded admin: both tables list rows; restore and hide work and update the table at once.
- As a member: `/admin/users` answers 403 and renders the "There are rules" page.
- Anonymous: `/admin/users` redirects to `/login?next=%2Fadmin%2Fusers`.
- Demote the admin in the database mid-session: the next action fails with Nest's 403 and the page shows the forbidden view.
- Each action prints exactly one JSON audit line after the response.
- Screen reader: each button's name includes its row.
- Do not run this against the dev database with any guard turned off.

## Done when

- [ ] `authInterrupts` on; `forbidden.tsx` and `requireAdmin()`
- [ ] Users table with delete and restore
- [ ] Hashtags table with hide, restore and the state filter
- [ ] `after()` audit line on every action
- [ ] Vitest specs for `requireAdmin()` branches
- [ ] Row added to `rendering-strategies.md`
