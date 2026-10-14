# RUG-35: Lane Certificate

Part of the Lebowski epic. See [index.md](../index.md). Realm: Rug. Phase 3. Blocked by: RUG-34, ABIDE-30.

**Scope:** A member who has an alignment and seven check-ins earns a shareable "Certified Abider of Dudesphere" certificate, drawn by an `ImageResponse` route, which never implies ordination and links to dudeism.com for the real thing.

## Gap

Ordination is a key Dudeist ritual, and members will want something to show. Dudesphere must not ordain anyone: ordination has legal effect at weddings, and Dudeism's ordination is its own. A playful certificate of participation fills the want without the risk.

## Scope

- Earning: `/abide` and `/dudes/me` show progress ("Quiz done. Check-ins: 5 of 7."). When both are met, a "Claim your certificate" button calls Server Action `claimCertificate()`, which sends `POST /profiles/me/lane-certificate` (API-29). Nest answers 409 `CERTIFICATE_NOT_EARNED` if not.
- `apps/web/src/app/certificate/[userId]/page.tsx`: public. Shows the certificate image, the member's display name, alignment and `laneCertifiedAt` date (formatted through gmt), and two links:
  - "Share" (copies the page URL).
  - "Want to be ordained for real? Dudeism does that, free, at dudeism.com." linking to `https://dudeism.com/ordination/`.
- `apps/web/src/app/certificate/[userId]/image/route.tsx`, `GET`: `new ImageResponse(<Certificate ... />, { width: 1600, height: 1200 })` from `next/og`. Reads the profile through a `'use cache'` function tagged `profile:<userId>`.
- `apps/web/src/app/certificate/[userId]/opengraph-image.tsx`: the same art at 1200 by 630 for link previews.
- A member with no certificate: the page 404s.
- The certificate needs the profile publicly. Nest's `GET /profiles/user/:id` is Token. Add **`GET /profiles/user/:id/certificate`**, Public, answering `{ displayName, alignment, laneCertifiedAt }` only when `laneCertifiedAt` is set, else 404.

**Certificate wording:**

> **Certified Abider of Dudesphere**
> This certifies that **[display name]** has taken the Laws of the Lane to heart, abided seven days, and bowls as **[alignment]**.
> Certified [date].
> This is a fan certificate. It is not an ordination and confers no religious or legal standing.

## Design notes

- **Never implies ordination.** The words "ordain", "ordained", "ordination", "priest", "minister", "reverend" and "clergy" never appear on the certificate. The only mention of ordination is the link out, which says Dudeism does that.
- **No Dudeism branding.** No Dudeism logo, seal or text. We name the site only in the link.
- **No film imagery.** Original border (from RUG-33's generator, using the member's rug if set), original type.
- **The certificate is public on purpose,** so it can be shared. It shows the display name and alignment only.

## Rendering strategy

`ImageResponse` in a Route Handler and in `opengraph-image.tsx`, the lesson's row for generated images. The data read is `'use cache'` with a per-profile tag, so a renamed member's certificate refreshes when FEED-17 calls `updateTag("profile:<id>")`.

## Verification

- With 6 check-ins: "Claim" answers `CERTIFICATE_NOT_EARNED` and the progress line shows 6 of 7.
- With 7 and an alignment: claim succeeds; `/certificate/<id>` renders; the image route returns a 1600 by 1200 PNG.
- A text check over the certificate component and page: none of the forbidden words appear.
- The dudeism.com link is present and points at `https://dudeism.com/ordination/`.
- An uncertified member's `/certificate/<id>`: 404. `GET /profiles/user/:id/certificate`: 404.
- Rename the member: the certificate shows the new name on next load.
- The page passes contrast checks; the image has alt text with the member's name.

## Done when

- [ ] Progress and claim on `/abide` and `/dudes/me`
- [ ] Public certificate page, image route and OG image
- [ ] `GET /profiles/user/:id/certificate` with e2e specs
- [ ] Wording above, forbidden-word spec, dudeism.com link
- [ ] `context/overview.md` gains the public route
- [ ] Row added to `rendering-strategies.md`
