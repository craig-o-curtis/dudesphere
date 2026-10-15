# API-43: Walter's Rules reports and moderation states

Part of the Lebowski epic. See [index.md](../index.md). Realm: API. Phase 4. Blocked by: none.

**Scope:** Members report an abiding or a profile, admins work a queue of reports, and an abiding can carry a moderation state: "Over the line" (a visible warning) or "Mark it zero" (removed from every list), with every action logged.

## Gap

The app is about to host groups, recipes and real-world meetups. Its only moderation tool is an admin deleting a user. There is no way for members to flag a post and no way to warn without removing. User-generated content also needs a takedown process to stay on the safe side of the legal caveats.

## Scope

**Postgres** (one migration):

`report`

| Column         | Type                                                                                     | Notes                                       |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `id`           | serial PK                                                                                |                                             |
| `reporterId`   | int FK `user.id` `ON DELETE CASCADE`                                                     |                                             |
| `targetKind`   | enum `abiding`, `profile`                                                                |                                             |
| `targetId`     | varchar(64)                                                                              | Mongo id for an abiding, profile id as text |
| `reason`       | enum `spam`, `harassment`, `hate`, `sexual`, `violence`, `illegal`, `copyright`, `other` |                                             |
| `note`         | varchar(500), nullable                                                                   |                                             |
| `status`       | enum `open`, `dismissed`, `actioned`                                                     | Default `open`                              |
| `createdAt`    | timestamptz                                                                              |                                             |
| `resolvedAt`   | timestamptz, nullable                                                                    |                                             |
| `resolvedById` | int FK `user.id` `ON DELETE SET NULL`, nullable                                          |                                             |

Unique `(reporterId, targetKind, targetId)` while `status = 'open'` (partial unique index).

`moderation_action`, append-only

| Column      | Type                                            | Notes                        |
| ----------- | ----------------------------------------------- | ---------------------------- |
| `id`        | serial PK                                       |                              |
| `abidingId` | varchar(24)                                     |                              |
| `state`     | enum `ok`, `over-the-line`, `marked-zero`       | The state set by this action |
| `reason`    | varchar(200)                                    | Shown to the author          |
| `byUserId`  | int FK `user.id` `ON DELETE SET NULL`, nullable |                              |
| `createdAt` | timestamptz                                     |                              |

**Mongo:** `abiding.moderation`: `{ state: "ok" | "over-the-line" | "marked-zero"; reason: string | null; at: string | null }`, default `{ state: "ok" }`. Index `{ "moderation.state": 1 }`.

**Behavior:**

- `over-the-line`: the abiding stays in every list. Its response carries `moderation.state` and `reason`; the web shows a warning.
- `marked-zero`: the abiding drops out of every list and `GET /abidings/:id` answers 404, except to its author and admins, who see it with the state and reason. Its replies stay; their parent shows as "Marked zero" in a thread.

**Routes:**

| Method | Path                       | Access | Does                                                                                                               |
| ------ | -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| POST   | `/reports`                 | Token  | `{ targetKind, targetId, reason, note? }`. 201. Duplicate open report: 200, unchanged. Limit 10 an hour per user   |
| GET    | `/reports`                 | Admin  | `?status=open` (default), paginated, oldest first, grouped count per target                                        |
| POST   | `/reports/:id/dismiss`     | Admin  | 200                                                                                                                |
| POST   | `/abidings/:id/moderation` | Admin  | `{ state, reason }`. Sets the state, writes a `moderation_action`, marks the target's open reports `actioned`. 200 |
| GET    | `/abidings/:id/moderation` | Admin  | The action history                                                                                                 |

A report on a profile is actioned by the existing admin user routes; this story adds no profile states.

**Policy** `ReportPolicy` and an `AbidingPolicy` action `moderate`, admin only. There is no moderator role yet; admins moderate.

## Design notes

- **Walter's voice, plain meaning.** "Over the line" is a warning. "Mark it zero" is removal. The UI explains both in plain words (MOD-44).
- **Moderation is not deletion.** A marked-zero abiding stays in Mongo, so an action can be reversed by setting `ok`, and the author can see why.
- **The log is append-only** in Postgres beside the reporter and the admin, who are Postgres users.
- **Copyright reports** are the takedown path the legal caveats call for. `reason: "copyright"` is listed in the queue first.
- **Reporters stay anonymous** to the reported member.

## Verification

E2E with e2e users:

- B reports A's abiding for spam: 201. Again: 200, one open row. Eleven reports in an hour: 429.
- Admin lists open reports: sees it. A member: 403.
- Admin sets `over-the-line` with a reason: the abiding still lists, with `moderation.state` and `reason`; the report is `actioned`; one `moderation_action` row.
- Admin sets `marked-zero`: it drops from `GET /abidings` and `?hashtag=`; `GET /abidings/:id` is 404 for B, 200 for A and the admin.
- Admin sets `ok`: back in lists; three action rows.
- Dismiss a report: status `dismissed`.
- `report` and `moderation_action` rows of e2e users are deleted and counted in the shared e2e cleanup in `apps/api/test/e2e-cleanup.ts`, so `pnpm e2e:check` sees them.

## Done when

- [ ] Migration with `report` and `moderation_action`
- [ ] `moderation` on abidings, with list and read filters
- [ ] Report and moderation routes, policies, rate limit
- [ ] Unit, e2e and route-access specs; cleanup updated
- [ ] `packages/api-types` and `context/overview.md` updated
