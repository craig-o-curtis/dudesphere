# API-15: Replies list and reply count

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 1. Blocked by: none.

**Scope:** `GET /abidings?replyToId=<id>` lists the replies to one abiding, and every abiding in a response carries `replyCount`, the number of live replies to it.

## Gap

A reply is an abiding with `replyToId`, and Nest stores it, but no route lists the replies to one abiding. The thread page (FEED-16) cannot show a conversation. Feed cards cannot say how many replies an abiding has. Both were backend gaps in the old frontend plan.

## Scope

- `apps/api/src/abidings/dto/get-abidings.dto.ts`: `GetAbidingsBaseDto` gains

  ```ts
  @IsOptional()
  @IsMongoId()
  replyToId?: string;
  ```

  A value that is not 24 hex characters answers 400.

- `apps/api/src/abidings/abidings.service.ts`: the list query adds `{ replyToId }` when set. It combines with `userId`, `hashtag`, `startDate` and `endDate` as they combine today. Order stays newest first.
- `GET /abidings?replyToId=<id>`: Public, paginated with `limit` and `page`, the usual `data`, `meta` and `links`.
- `replyCount`:
  - `AbidingResponseDto` gains `@Expose() replyCount: number`.
  - After a page is read, one aggregation counts replies for the page's ids:

    ```js
    [
      { $match: { replyToId: { $in: ids }, deletedAt: null } },
      { $group: { _id: "$replyToId", n: { $sum: 1 } } },
    ];
    ```

    Ids with no row get 0. `GET /abidings/:id` runs the same for one id.
- Index: `abiding.schema.ts` adds `{ replyToId: 1, createdAt: -1 }`. Mongoose builds it on start, as the existing indexes are built.
- `packages/api-types`: `AbidingResponse` gains `replyCount: number`; the drift contract covers it.
- `context/overview.md`: the abidings table gains the `replyToId` filter row and a line on `replyCount`.

## Design notes

- **Counted on read, not stored.** A stored counter would need an update on every reply, delete and soft delete of an author, and it would drift. One aggregation per page, on an index, is cheap.
- **Soft-deleted replies do not count.** The `deletedAt: null` filter matches what the list returns.
- **One level.** `replyToId` lists direct replies. A reply to a reply is listed under its own parent. The thread page links down.
- **A missing parent is not an error.** `?replyToId=` of an id with no abiding answers an empty page, like a hashtag with no abidings.

## Verification

E2E, `abidings-replies.e2e-spec.ts` with e2e users:

- Post A, then replies R1, R2, R3 to A, then R4 to R1. `GET /abidings?replyToId=A` lists R3, R2, R1 in that order, and not R4.
- `GET /abidings/A` has `replyCount: 3`. `GET /abidings/R1` has `replyCount: 1`.
- `?replyToId=A&limit=2` has `links.next` set; page 2 holds R1.
- `?replyToId=nothex` answers 400.
- `?replyToId=<24 hex, no such abiding>` answers 200 with an empty `data`.
- Soft-delete R2's author: `replyCount` of A becomes 2 and the list drops R2. Restore: back to 3.
- `GET /abidings` (no filter) carries `replyCount` on every item.

Unit:

- The service passes `replyToId` into the filter, and the count merge gives 0 for ids with no replies.

## Done when

- [ ] `replyToId` filter with `@IsMongoId()`
- [ ] `replyCount` on every abiding response, from one aggregation per page
- [ ] `{ replyToId: 1, createdAt: -1 }` index
- [ ] Unit and e2e specs as listed
- [ ] `AbidingResponse` in `packages/api-types` updated
- [ ] `context/overview.md` updated
