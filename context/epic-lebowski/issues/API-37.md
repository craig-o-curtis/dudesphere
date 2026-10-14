# API-37: Achievers groups and the group feed

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 4. Blocked by: none.

**Scope:** Postgres stores Achievers groups and their members, Nest routes create, list, join and leave them, and an abiding can be posted into a group and listed with `GET /abidings?groupId=`.

## Gap

Lebowski fans call themselves Achievers and gather by city. The app has one global feed and no way to gather. Groups are the base for Bowling Nights (API-39) and the group leaderboard.

## Scope

**Tables** (one migration):

`achiever_group`

| Column        | Type                                            | Notes                                    |
| ------------- | ----------------------------------------------- | ---------------------------------------- |
| `id`          | serial PK                                       |                                          |
| `slug`        | citext UNIQUE                                   | 3 to 40 characters, `a-z`, `0-9` and `-` |
| `name`        | varchar(60)                                     |                                          |
| `city`        | varchar(100), nullable                          | Free text, such as "Louisville, KY"      |
| `description` | text, nullable                                  | Up to 1,000 characters                   |
| `createdById` | int FK `user.id` `ON DELETE SET NULL`, nullable |                                          |
| `createdAt`   | timestamptz                                     |                                          |
| `updatedAt`   | timestamptz                                     |                                          |
| `deletedAt`   | timestamptz, nullable                           | Soft delete                              |

`group_member`

| Column     | Type                                           | Notes                      |
| ---------- | ---------------------------------------------- | -------------------------- |
| `groupId`  | int FK `achiever_group.id` `ON DELETE CASCADE` | PK part                    |
| `userId`   | int FK `user.id` `ON DELETE CASCADE`           | PK part, indexed           |
| `role`     | enum `organizer`, `member`                     | The creator is `organizer` |
| `joinedAt` | timestamptz                                    |                            |

**Routes**, module `apps/api/src/groups/`:

| Method | Path                                 | Access             | Does                                                                                          |
| ------ | ------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------- |
| POST   | `/groups`                            | Token              | `{ slug, name, city?, description? }`. Creator becomes organizer. 201. 409 `GROUP_SLUG_TAKEN` |
| GET    | `/groups`                            | Public             | Live groups, paginated, by name. `?city=` contains-match, `?q=` name search                   |
| GET    | `/groups/mine`                       | Token              | Groups the caller belongs to                                                                  |
| GET    | `/groups/:slug`                      | Public             | One group with `memberCount`                                                                  |
| PATCH  | `/groups/:slug`                      | Organizer or admin | Name, city, description                                                                       |
| DELETE | `/groups/:slug`                      | Organizer or admin | Soft delete. 204                                                                              |
| POST   | `/groups/:slug/restore`              | Admin              | 200                                                                                           |
| POST   | `/groups/:slug/members`              | Token              | Join. 201, or 200 if already a member                                                         |
| DELETE | `/groups/:slug/members/me`           | Token              | Leave. 204. The last organizer cannot leave: 409 `LAST_ORGANIZER`                             |
| GET    | `/groups/:slug/members`              | Token              | Members with display names, paginated                                                         |
| PUT    | `/groups/:slug/members/:userId/role` | Organizer or admin | `{ role }`. 200                                                                               |

`mine` is declared before `:slug`, as `me` is elsewhere; a slug cannot be `mine` (reserved list: `mine`, `new`, `admin`).

**Policy** `GroupPolicy` with `create`, `update`, `delete`, `restore`, `manageMembers`.

**Group feed** (Mongo):

- `abiding.schema.ts` gains `groupId: number | null`, default null, with an index `{ groupId: 1, createdAt: -1 }`.
- `CreateAbidingDto` accepts `groupId`. Nest checks the caller is a member of that live group, or 403 `NOT_GROUP_MEMBER`. A reply takes its parent's `groupId`.
- `GetAbidingsDto` accepts `groupId` (positive integer). `GET /abidings?groupId=` is Public, like every abidings list.
- `GET /abidings` with no `groupId` keeps listing every abiding, group posts included.
- `AbidingResponseDto` gains `groupId`.

## Design notes

- **Groups in Postgres, posts in Mongo.** The membership relates users to groups, so it lives beside `user` with foreign keys. The abiding carries a plain `groupId`, as it already carries a plain `userId`. No foreign key crosses the stores; the membership check happens in Nest at post time.
- **A deleted group's posts stay.** Soft-deleting a group hides the group; its abidings stay in the global feed. `?groupId=` of a deleted group answers an empty page.
- **Slugs are lower-case words with hyphens,** unlike hashtag slugs, because they are URLs people type.
- **Open groups only in the MVP.** Anyone may join. Private groups are a later story.

## Verification

E2E with e2e users (slugs start `e2e-`):

- A creates `e2e-louisville`: 201, A is organizer. Same slug in other case: 409 `GROUP_SLUG_TAKEN`.
- B joins; `memberCount` is 2. B joins again: 200, still 2.
- B posts into the group: 201 with `groupId`. C (not a member) posts into it: 403 `NOT_GROUP_MEMBER`.
- `GET /abidings?groupId=<id>` lists B's post; `GET /abidings` lists it too.
- A leaves as the only organizer: 409 `LAST_ORGANIZER`. A promotes B, then leaves: 204.
- B edits the group as organizer: 200. C edits: 403.
- Admin deletes, then restores: the group is hidden, then back.
- `GET /groups/mine` for B lists the group.
- `achiever_group` rows with an `e2e-` slug and `group_member` rows of e2e users are in `apps/api/test/global-setup.ts`.

## Done when

- [ ] Migration with both tables
- [ ] Groups module, routes and `GroupPolicy`
- [ ] `groupId` on abidings with the membership check and index
- [ ] Error codes `GROUP_SLUG_TAKEN`, `NOT_GROUP_MEMBER`, `LAST_ORGANIZER`
- [ ] Unit, e2e and route-access specs; cleanup updated
- [ ] `packages/api-types` and `context/overview.md` updated
