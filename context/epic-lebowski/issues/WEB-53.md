# WEB-53: Privacy and cookies page

Part of the Lebowski epic. See [index.md](../index.md). Realm: Web. Phase 5. Blocked by: none.

**Scope:** A static `/privacy` page tells members, in a clear and relaxed voice, what Dudesphere keeps about them, why, for how long, and what rights they have. It includes a table of the app's cookies. It must be live before real people can sign up, so it blocks the WEB-45 deploy.

## Gap

AUTH-7 lets people sign up with an email, a username and a display name. GDPR Art. 13 says that when an app collects personal data, it must tell people what it keeps and why at that moment. No story plans that notice yet. AUTH-7 decided against a cookie banner, because the app's cookies don't need consent:

- `__Host-session` and `__Secure-refresh` keep a member signed in, so they are strictly necessary (ePrivacy Directive Art. 5(3), UK PECR reg. 6).
- `theme` is set only when a member picks Light or Dark. That makes it a user-interface choice made at the member's request, which also needs no consent (Article 29 Working Party, Opinion 04/2012).

AUTH-7 shows one cookie line under its forms. This page is the full notice that line points to. None of this is legal advice. Have it checked before launch.

## Scope

**`apps/web/src/app/(public)/privacy/page.tsx`**: fully static, with no request-time data. Its sections:

- **What we keep.** Email, username, display name, abidings and replies, and sign-in records (token families and their dates).
- **Why.** Running your account and the feed. No ads. No selling data. No tracking.
- **How long.** As long as the account exists, plus how long sign-in records are kept.
- **Who else handles it.** The hosts named in WEB-45: Vercel, the API's host, Neon, the MongoDB host, and the email provider.
- **Your rights.** Access, correction, deletion, objection and complaint, and how to ask for each. Until the privacy work (Part 4 of the auth plan) ships export and erase, a member asks by email.
- **Cookies.** A table of the three cookies: name, what it's for, how long it lasts, and whether it needs consent.
- **A reminder:** inspired by the film, not affiliated with it.

**Links:**

- From the footer, next to the disclaimer.
- From AUTH-7's cookie line under the sign-in and sign-up forms.

## Not in scope

- Recording that a member accepted the notice at sign-up, export, and erase. These wait for the privacy work (Part 4), which is on hold.
- A cookie banner.

## Design notes

- **The voice is relaxed but never vague.** Every section gives the plain fact first.
- **A later story that adds analytics or a third-party embed reopens the consent question.** It must update this page, and it may need a banner.
- **No inline scripts.** Style with CSS Modules on the WEB-6 tokens.

## Rendering strategy

Fully static. It is a good row for the "Static" line of `rendering-strategies.md`.

## Verification

- `next build` prerenders `/privacy` as static.
- The cookie table lists exactly the cookies the app sets, with their real names and lifetimes.
- The footer link and the AUTH-7 cookie line both reach the page.
- Headings are in order, the table has header cells, and the page reflows at 320 px.

## Done when

- [ ] `/privacy` page with every section above
- [ ] Links from the footer and from the auth forms' cookie line
- [ ] Vitest spec for the cookie table against the cookie names in `lib/session.ts`
- [ ] Row added to `rendering-strategies.md`
