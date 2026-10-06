# Hashtags — implementation plan

Status: built. Two Mongo collections, `abidings` and `hashtags`.

## Decision

The abiding-to-hashtag many-to-many lives in MongoDB, split across two
collections:

- **`abidings.hashtags`** — an array of normalized slugs on each Abiding
  document. This is the relationship itself.
- **`hashtags`** — one document per tag ever used (`slug`, `display`,
  `firstUsedAt`). This is the tag as an entity in its own right.

### Why not the textbook three tables

A relational schema would use `abiding`, `hashtag` and an `abiding_hashtag`
join table, with a real foreign key at each end of the join. That doesn't
transplant here, because abidings live in Mongo and users live in Postgres. A
Postgres join table would hold Mongo `_id` values as inert strings with no
foreign key behind them, no cascade on delete, and nothing enforcing that the
abiding it names still exists. Postgres cannot reference a document it does not
store.

A document store doesn't need the third table. A multikey index over
`abidings.hashtags` answers "which abidings have tag X" in one index hit, and
the array answers "which tags does this abiding have" without a query at all.
The array _is_ the join. That is the whole structural difference worth
understanding here: three tables relationally, two collections in Mongo,
because one side absorbs the join.

### Why the `hashtags` collection is still needed

The array alone makes the tag invisible as a thing. Two access patterns it
cannot serve:

1. **List every tag** — for a dropdown or autocomplete. Without a registry
   this means a `distinct` or `$unwind`/`$group` aggregation over every
   abiding in the collection, which is a scan, not a lookup.
2. **Store anything about a tag** — its original casing, when it first
   appeared, later a description or a moderation flag. An array of strings has
   nowhere to put any of it.

So the registry is not duplicated data for its own sake. It exists because
"tell me about this tag" and "find me abidings with this tag" are different
questions, and only the second one is answerable from the array.

### Accepted costs

- The database cannot enforce that `#Sunday` and `#sunday` are the same tag.
  One normalizer function is the only guard, so every write path must go
  through it. That is the single rule this plan exists to protect.
- The registry is written separately from the abiding, not in a transaction —
  a multi-document Mongo transaction needs a replica set, which the
  single-node Docker setup doesn't run. If the abiding write succeeds and the
  registry upsert fails, the abiding carries a tag the registry doesn't list.
  It heals the next time anyone uses that tag, and `pnpm backfill:hashtags`
  repairs it in bulk. Nothing reads the registry to decide what an abiding
  says, so an abiding is never wrong — only a dropdown is briefly short an
  entry. `HashtagsService.registerTags` logs and swallows every failure for
  this reason: a registry problem must not cost a user their post.
- A tag is never deleted from the registry, even when no abiding uses it any
  more. That is deliberate, and matches how a hashtag page on Twitter outlives
  the tweets on it.

## Scope

In scope:

- Derive hashtags from the abiding message on create and on message edit.
- Store them as normalized slugs on the Abiding document.
- Register each tag in the `hashtags` collection as a side effect of posting.
- Filter abidings by hashtag, one tag or several (OR).
- List the registry for a dropdown, and look up one tag.
- Return hashtags on the abiding response.

Out of scope — do not build these:

- A Postgres `hashtag` table or `user_hashtag_follow` join table. Those arrive
  with the follow feature, which does not exist yet. They are additive and
  change nothing built here.
- Trending or tag counts. That is a windowed aggregation, covered under
  [Deferred work](#deferred-work). The registry deliberately stores no usage
  count: a counter maintained outside a transaction drifts, and the count is
  derivable from the abidings whenever it's actually wanted.
- Tag pages and tag moderation. `GET /hashtags` gives a client everything it
  needs to build autocomplete itself; server-side prefix search can come later
  if the registry grows past the point where sending all of it is reasonable.

## Design

### Hashtags derive from the message

The message is the single source of truth. `hashtags` is a derived index of it,
never an independently settable field.

This matters because `AbidingsService.patchAbiding` lets the message change. If
hashtags were a separate input, an edit could leave the array describing the old
text. Deriving on every message write makes that impossible.

Consequence for the API: `CreateAbidingDto` and `UpdateAbidingDto` get **no**
`hashtags` field. A client that posts one is ignored. Write a test for that.

### Normalization

One exported function, used by every write path and by the read filter.

Location: `src/shared/utils/hashtag.ts`

```ts
// Pulls hashtags out of an abiding message and normalizes them.
// The message keeps its original casing for display; these slugs are the
// index. Callers must never build a slug by hand — `#Sunday` and `#sunday`
// are the same tag only because this function says so.
export function extractHashtags(message: string): string[];

// Normalizes one tag for a read filter. Same rules as extraction.
// Returns null when nothing usable is left.
export function normalizeHashtag(raw: string): string | null;
```

Rules, in order:

1. Match `#` followed by 1 to 64 unicode letters, digits or underscores:
   `/#([\p{L}\p{N}_]{1,64})/gu`. The `u` flag is required.
2. Drop the leading `#`.
3. Lowercase with `toLowerCase()`.
4. Deduplicate, preserving first-seen order.
5. Keep at most 10 tags per abiding. Drop the rest silently — the 280-character
   message cap already makes this an edge case.

`normalizeHashtag` accepts a slug with or without a leading `#`, applies steps
2 to 4, and returns `null` if the result is empty or over 64 characters.

Reject nothing at the API boundary. A message with no valid tags simply gets an
empty array.

### Schema change

In `src/abidings/abiding.schema.ts`, add to the `Abiding` class:

```ts
// Normalized slugs derived from `message` by extractHashtags. Never set
// directly by a client — see context/hashtag-plan.md.
@Prop({ type: [String], default: [] })
hashtags: string[];
```

Add two indexes next to the existing ones, with comments in the same style:

```ts
// get latest abidings for a hashtag — the query this feature exists to serve
AbidingSchema.index({ hashtags: 1, createdAt: -1 });
// get a user's abidings for a hashtag
AbidingSchema.index({ userId: 1, hashtags: 1 });
```

Mongo indexes an array field as a multikey index, so `find({ hashtags: "x" })`
is one index hit. Do not add a plain `{ hashtags: 1 }` index — the compound one
above already serves that prefix.

### Existing documents

`default: []` applies to new documents only. Abidings already in the collection
have no `hashtags` field at all.

That is harmless for reads: `find({ hashtags: "sunday" })` does not match a
missing field, which is the correct answer for an untagged abiding. But their
messages may contain `#` text that will never be findable.

Write a backfill script at `src/database/seeds/backfill-hashtags.ts` following
the shape of the existing seed scripts. It reads every abiding, runs
`extractHashtags` on the message, and `$set`s the result. It must be safe to run
twice. Add a `backfill:hashtags` script to `package.json` next to `seed:run`.

Run it once after deploying the schema change. Say so in the PR description.

## Files

Create:

| Path                                          | What                                                            |
| --------------------------------------------- | --------------------------------------------------------------- |
| `src/shared/utils/hashtag.ts`                 | `extractHashtags`, `extractHashtagDisplays`, `normalizeHashtag` |
| `src/hashtags/hashtag.schema.ts`              | The registry collection                                         |
| `src/hashtags/hashtags.service.ts`            | `listAll`, `getBySlug`, `registerTags`                          |
| `src/hashtags/hashtags.controller.ts`         | `GET /hashtags`, `GET /hashtags/:slug`                          |
| `src/hashtags/hashtags.module.ts`             | Registers the model, exports the service                        |
| `src/hashtags/dto/hashtag-response.dto.ts`    | `slug`, `display`, `firstUsedAt`                                |
| `src/database/seeds/hashtag-backfill.seed.ts` | Backfill logic, testable without booting the app                |
| `src/database/seeds/backfill-hashtags.ts`     | Thin runner for `pnpm backfill:hashtags`                        |

Change:

| Path                                          | What                                                      |
| --------------------------------------------- | --------------------------------------------------------- |
| `src/abidings/abiding.schema.ts`              | `hashtags` prop, two indexes                              |
| `src/abidings/abidings.service.ts`            | Derive on create and patch, register tags, filter on read |
| `src/abidings/abidings.controller.ts`         | `hashtag` query param, dispatch, pass through on response |
| `src/abidings/abidings.module.ts`             | Imports `HashtagsModule`, provides the backfill service   |
| `src/abidings/dto/abiding-response.dto.ts`    | `hashtags: string[]`                                      |
| `src/abidings/dto/list-abidings-query.dto.ts` | New — validated `userId` and `hashtag`                    |
| `src/app.module.ts`                           | Imports `HashtagsModule`                                  |
| `package.json`                                | `backfill:hashtags` script                                |
| `context/overview.md`                         | `hashtags` collection and endpoints                       |

Note on the query DTO: the controller currently takes `@Query("userId") userId?: number`
with no validation, so a junk value reaches Mongo. `src/users/dto/list-users-query.dto.ts`
is the pattern this repo already uses for a validated query object. Add
`ListAbidingsQueryDto` with `userId` and `hashtag`, both optional. Keep the
change minimal — this is not a refactor of the users endpoints.

## Service changes

`AbidingsService.createAbiding` — derive before the write:

```ts
const newAbiding = await this.abidingModel.create({
  userId: Number(createAbidingDto.userId),
  message: createAbidingDto.message,
  replyToId: createAbidingDto.replyToId || null,
  hashtags: extractHashtags(createAbidingDto.message),
});
```

`AbidingsService.patchAbiding` — this method currently spreads the DTO straight
into `findOneAndUpdate` via `Object.assign`. Two things must change:

1. When `message` is present, re-derive `hashtags` and include it in the update.
2. When `message` is absent, leave `hashtags` untouched. Do not write `[]`.

Build the update object explicitly rather than spreading the DTO. The spread is
what would let a client-supplied `hashtags` field through.

**Revised during build** (kept here so the record matches the code): hashtag
filtering is not a second parameter on `getAbidings`. It's two dedicated
methods, `getAbidingsByHashtag(hashtag, userId?)` and
`getAbidingsByHashtags(hashtags, userId?)`, mirroring the existing
`getAbidingsByUserId`. The plural variant matches with OR — an abiding needs
only one of the given tags, via Mongo's `$in`. Both normalize in the service,
not the controller, so no caller can skip it. `AbidingsController.getAbidings`
splits the `hashtag` query param on commas and dispatches to whichever method
fits: no tags → `getAbidings(userId?)`, one tag → `getAbidingsByHashtag`,
several → `getAbidingsByHashtags`.

`toResponseDto` — add `hashtags: abiding.hashtags ?? []`. The `?? []` covers
documents written before the backfill runs.

## Repo conventions you must follow

Read `.agents/skills/nestjs-best-practices` before writing code. Beyond that,
the things this repo enforces that are easy to miss:

- **No `Date` objects anywhere in app code.** Timestamps are UTC ISO 8601
  strings from `@northguild/gmt`. `getUtcNow()` returns `""` on failure, and the
  established response is to throw `ServiceUnavailableException`, not to write a
  blank. See `UserAbidingsService.softDeleteForUser` for the pattern. The
  backfill script needs this if it stamps anything. `gmt-oxlint` will fail the
  lint if you reach for `Date`.
- **ESM with explicit `.js` import extensions**, including on `.ts` files.
- **Mirror the existing comment style.** The abidings files explain _why_ a
  filter or an ordering exists, not what the line does. Match that density.
- **Soft-delete filter.** Every read adds `deletedAt: null`. Your hashtag filter
  is an addition to that query, never a replacement.
- **Controller route ordering.** `@Get("me")` sits before `@Get(":id")` on
  purpose. If you later add a single-segment route it must go above `:id` too.
  A `hashtag` query param avoids this problem entirely, which is why this plan
  uses one.
- **Prose** — commit message, PR title, PR description — follows
  `.agents/skills/plain-english`.
- **Never run `git push`.** Ask first, every time.

## Tests

Unit, in `src/shared/utils/hashtag.spec.ts`:

- Extracts one tag, several tags, no tags.
- Lowercases: `#Sunday` and `#SUNDAY` both give `sunday`.
- Deduplicates `#dude #Dude` to one `dude`.
- Keeps unicode letters: `#señor`, `#日本`.
- Stops at punctuation: `#dude.` gives `dude`, `#dude's` gives `dude`.
- Ignores a bare `#` and `# dude`.
- Drops a 65-character tag.
- Caps at 10 tags.
- `normalizeHashtag` handles input with and without `#`, returns `null` on junk.

Service, in `src/abidings/abiding.service.spec.ts` and
`src/abidings/abidings.controller.spec.ts` — follow the existing mocking style
in those files:

- Create derives hashtags from the message.
- Create ignores a client-supplied `hashtags` field.
- Patch with a new message re-derives hashtags.
- Patch without a message leaves hashtags alone.
- Patch ignores a client-supplied `hashtags` field.
- Read by hashtag normalizes the input before querying.
- Read by hashtag keeps `deletedAt: null` in the query.
- Response includes `hashtags`, and `[]` for a document that has no field.

Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before opening the PR. All
three must pass.

## Acceptance

- [ ] `POST /abidings` with `"Taking it easy #Sunday #Dude"` stores
      `["sunday", "dude"]`.
- [ ] `GET /abidings?hashtag=SUNDAY` returns it.
- [ ] `GET /abidings?hashtag=sunday&userId=1` returns only that user's.
- [ ] `PATCH /abidings/:id` with a new message replaces the hashtags.
- [ ] A soft-deleted user's abidings do not appear in a hashtag query.
- [ ] Backfill script runs twice with the same result.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Deferred work

Record these in the PR description as follow-ups. Do not build them.

**Trending.** Aggregate with `$unwind: "$hashtags"` over a recent `createdAt`
window, then cache the result. Do not add a stored counter. A count column in
one database describing rows in another will drift, and there is no transaction
spanning Postgres and Mongo to keep it honest.

**Following a tag.** This is the one thing that belongs in Postgres, because the
relation has `user.id` on one end — and it is where the textbook join table
finally does fit, since both ends would live in the same database. A `hashtag`
table plus a `user_hashtag_follow` join table with `ON DELETE CASCADE` gives
you cleanup on user delete inside the existing Postgres transaction, and keeps
Mongo out of it. Note this means a tag would then exist in both stores, keyed
by slug: the Mongo registry for "what tags exist and what do abidings use", the
Postgres table for "who follows what". That duplication is acceptable only
because the slug is stable and neither side needs the other's rows to answer
its own questions.
`src/abidings/user-abidings.service.ts` documents why that matters: Mongo sits
outside that transaction, and nothing more should be added to the list of things
that can leave the two stores disagreeing. The normalized slug is the only value
that crosses between them. No ids cross.

## One thing to flag

`context/overview.md` is out of date against the code, separately from this
work. It lists the user roles as `ADMIN, PRIEST, MEMBER` and a `name` column,
but `src/users/user.entity.ts` has `ADMIN, USER` and a `username` column. It
also omits `profile`, `imageUrl` and `deletedAt`. Fix only the hashtag rows this
plan asks for, and mention the rest in the PR description so someone can decide
whether to correct it.
