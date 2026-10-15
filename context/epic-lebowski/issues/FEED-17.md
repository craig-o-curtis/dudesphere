# FEED-17: Dude pages and edit forms

Part of the Lebowski epic. See [index.md](../index.md). Realm: Feed. Phase 1. Blocked by: WEB-5.

**Scope:** `/dudes/[id]` shows a member's profile and abidings, and `/dudes/me` adds forms that edit the member's own user and profile, with Nest's field errors shown under each input.

## Gap

A display name links nowhere. A member cannot see another member's page, and cannot change their own display name, bio, picture or password. Later stories (the Rug, the certificate, location) all hang off this page.

## Scope

- `apps/web/src/app/(app)/dudes/[id]/page.tsx`:
  - `requireSession()` inside Suspense: profiles need a token.
  - Profile from Nest `GET /profiles/user/:id` (Token). Heading: the `displayName`.
  - Abidings from `GET /abidings?userId=:id` (Public), paginated with FEED-13's `FeedList`.
  - The Dudeist badge when `isDude` is true: "Dudeist Priest, ordained through dudeism.com, 12 March 2024 (as they tell it)". The date comes from `ordainedDate` and is formatted through gmt. With no date: "Dudeist Priest (as they tell it)".
  - URLs carry the numeric user id, such as `/dudes/42`. Never a username, never a display name.
  - A 404 from Nest calls `notFound()`.
- `apps/web/src/app/(app)/dudes/me/page.tsx`:
  - Own user from `GET /users/me`, own profile from `GET /profiles/me` (both Token). Shows the member their own username and email.
  - Form "Your profile": display name, bio, profile image URL, "I'm a Dudeist" checkbox, ordination date. Server Action `updateProfile` calls `PATCH /profiles/me`.
  - Form "Your account": username, email. Server Action `updateAccount` calls `PATCH /users/me`.
  - Form "Change password": current password, new password, same again. Server Action `changePassword` calls `PATCH /users/me` with the fields `UpdateUserDto` takes for a password change. 403 `WRONG_PASSWORD` shows under "Current password".
  - "Leave the sphere": a button that opens a confirm dialog ("This closes your account. Your abidings go with it. An admin can bring it back."). Server Action `leave` calls `DELETE /users/me`, clears the cookies and redirects to `/`.
  - "Sign out everywhere" (AUTH-7's action).
- Every action re-checks the session and returns `{ fieldErrors }` from Nest's 400 and the 409 codes `DISPLAY_NAME_TAKEN`, `EMAIL_TAKEN` and `USERNAME_TAKEN`.
- After a successful edit: `updateTag("profile:" + userId)` and, for a display name change, `updateTag("abidings")`, because every abiding shows the current name.

## Design notes

- **The page never shows another member's username.** Nest does not send it. Only `/dudes/me` shows the member their own.
- **The badge is the member's claim.** Dudesphere does not ordain anyone and does not check. The badge says "as they tell it" and names dudeism.com as the source of real ordination.
- **Dates through gmt.** The ordination date input is a date field; the action turns it into a UTC instant string with gmt before sending. No `Date`.
- **Changing the password ends every sign-in.** Nest stops all tokens. The action then sends the member to `/login?changed=1` with "Password changed. Roll in again."
- **A taken display name in any letter case** gets the 409 message under the input: "That name's taken, man."

## Rendering strategy

Dynamic streaming: both pages need a session, read inside Suspense with `loading.tsx`. Forms are Server Actions with `useActionState`, passing Nest's field errors through unchanged.

## Verification

- `/dudes/<e2e id>` shows the display name, bio and abidings; the HTML contains no username.
- `/dudes/me` shows the member's own username and email.
- Change the display name to another member's name in different case: the 409 message shows.
- Change the display name: the member's old abidings show the new name on the next feed load.
- Wrong current password: `WRONG_PASSWORD` message under the input.
- Change the password: redirected to `/login?changed=1`; the old cookies no longer work.
- "Leave the sphere": confirm, signed out, `/dudes/<id>` now 404s for other members.
- With `isDude` and a date: "Dudeist Priest, ordained through dudeism.com, 12 March 2024 (as they tell it)".
- Every form works with JavaScript off and with the keyboard alone.

## Done when

- [ ] `/dudes/[id]` and `/dudes/me` pages with `loading.tsx`
- [ ] Profile, account, password and leave actions with Nest's errors
- [ ] Badge copy as above, dates through gmt
- [ ] `updateTag` after edits
- [ ] Vitest specs for the actions' error mapping
- [ ] Row added to `rendering-strategies.md`
