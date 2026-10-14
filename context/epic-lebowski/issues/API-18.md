# API-18: Hidden hashtags list for admins

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 1. Blocked by: none.

**Scope:** Admins can list every hashtag, hidden ones included, with each tag's `deletedAt`, so the admin page (FEED-19) can restore a hidden tag it cannot otherwise find.

## Gap

`GET /hashtags` lists live tags only. An admin can hide a tag with `DELETE /hashtags/:slug` and restore it with `POST /hashtags/:slug/restore`, but no route lists hidden tags. The admin page would have to know the slug by heart.

## Scope

- The plan names the shape `GET /hashtags?includeDeleted=true`, admin only. `GET /hashtags` is `@Public()`, and on a public route `@nestjs/authentication` reads no token at all. So the controller cannot tell an admin from anyone else on that route, and a flag there cannot be checked. See the decision below.
- **Recommended route:** `GET /hashtags/with-hidden`, Admin, through `@Can(HashtagPolicy, "viewHidden")`.
  - A slug cannot hold a hyphen, so `with-hidden` can never match a real tag's `:slug`. Declare it before `@Get(":slug")` anyway, as `me` is declared before `:id` in the other controllers.
  - Query: `limit`, `page`, and `state=all|live|hidden` (default `all`).
  - Answers the usual paginated shape, ordered by slug. Each item is a `HashtagResponseDto` plus `deletedAt: string | null`.
- `apps/api/src/hashtags/hashtag.policy.ts`: new action `viewHidden`, admin only.
- `apps/api/src/hashtags/dto/admin-hashtag-response.dto.ts`: extends the public DTO with `@Expose() deletedAt`.
- `apps/api/src/auth/route-access.spec.ts` and `test/routes.ts`: the new route is declared and covered.
- `packages/api-types`: `AdminHashtagResponse`.
- `context/overview.md`: the hashtags table gains the row.

## Design notes

- **Decision needed: route shape.** Option 1 (recommended): the separate admin route above. Option 2: keep `?includeDeleted=true` on the public route and teach it to read an optional token. Option 2 matches the plan's wording but fights the package: a public route that sometimes authenticates is a pattern the docs do not show. Craig picks before the code is written.
- **The public route does not change.** `GET /hashtags` keeps listing live tags only, for everyone.
- **Hidden is a soft delete.** `deletedAt` set means hidden. Nothing is ever removed.

## Verification

E2E with e2e users and `e2e<12 hex>` tags:

- Create tags T1 and T2, hide T2 as admin. `GET /hashtags/with-hidden` as admin lists both; T2 has `deletedAt` set.
- `?state=hidden` lists T2 only; `?state=live` lists T1 only.
- As a non-admin: 403 "Forbidden". With no token: 401 `missing_credentials`.
- `GET /hashtags` still omits T2 for everyone.
- `GET /hashtags/with-hidden` is not treated as a slug lookup.
- `route-access.e2e-spec.ts` covers the route with no token and with the wrong role.

## Done when

- [ ] Route shape decided and recorded here
- [ ] Admin list route with the `viewHidden` policy action
- [ ] Admin DTO with `deletedAt`
- [ ] E2E and route-access coverage
- [ ] `packages/api-types` and `context/overview.md` updated
