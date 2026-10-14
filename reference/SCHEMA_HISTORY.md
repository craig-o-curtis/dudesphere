# How the Postgres schema got here

On 2026-10-14 the 16 migrations below were squashed into one,
`InitialSchema`. No database that had to be kept had run them: Neon was
empty, CI starts from an empty database, and the local one could be rebuilt.
So the steps protected nothing, and every new database replayed them,
including data copies for data that never existed.

The old files are kept under the git tag `pre-migration-squash`. Each link
below opens one. This note keeps what they teach.

**From the first run against Neon, migrations are append-only.** A database
records the name of every migration it has run. Edit or delete one it ran,
and the database and the code disagree. Squashing is only safe before that.

## The timeline

| #   | Migration                                                                                                                                                                                  | What it changed                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | [CreateInitialSchema](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1700000000000-CreateInitialSchema.ts)                                 | `user` and `profile`, written by hand                                  |
| 2   | [AlignSchema](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1790767195266-AlignSchema.ts)                                                 | `role` text → enum, in place; index and key names → TypeORM's          |
| 3   | [AddProfileDeletedAt](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1790931132081-AddProfileDeletedAt.ts)                                 | Soft delete for profiles, backfilled from their users                  |
| 4   | [DropRedundantUserIndexes](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791440926620-DropRedundantUserIndexes.ts)                       | Dropped two indexes that UNIQUE already gave                           |
| 5   | [TimestampsWithTimeZone](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791542877415-TimestampsWithTimeZone.ts)                           | Every `timestamp` → `timestamptz`                                      |
| 6   | [CaseInsensitiveUsernameAndEmail](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791652758485-CaseInsensitiveUsernameAndEmail.ts)         | `citext` for username and email, three CHECKs                          |
| 7   | [AddPasswordResetToken](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791654323484-AddPasswordResetToken.ts)                             | `password_reset_token`                                                 |
| 8   | [ProfileDisplayName](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791714615343-ProfileDisplayName.ts)                                   | `firstName` + `lastName` → one unique `displayName`, backfilled        |
| 9   | [AddUserPasswordChangedAt](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791729908727-AddUserPasswordChangedAt.ts)                       | `passwordChangedAt`, so a password change ends old tokens              |
| 10  | [AddRefreshToken](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791737547894-AddRefreshToken.ts)                                         | `refresh_token`, one row per token                                     |
| 11  | [RestrictUserDeleteWithRefreshTokens](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791896833273-RestrictUserDeleteWithRefreshTokens.ts) | Token rows' key to `user`: CASCADE → RESTRICT                          |
| 12  | [RenameFamilyToSession](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791906005557-RenameFamilyToSession.ts)                             | `familyId` → `sessionId`, by RENAME, not drop and add                  |
| 13  | [AddSessionTable](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791908279667-AddSessionTable.ts)                                         | A `session` row per sign-in, filled from the token rows                |
| 14  | [AuthenticationTables](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791960794027-AuthenticationTables.ts)                               | Moved to `@nestjs/authentication`'s tables, copying every token across |
| 15  | [SessionIdOnRefreshTokens](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791967006363-SessionIdOnRefreshTokens.ts)                       | `refresh_tokens.sid`, so an access token stops with its sign-in        |
| 16  | [RevokedSignInIndex](https://github.com/craig-o-curtis/dudesphere/blob/pre-migration-squash/src/database/migrations/1791979584968-RevokedSignInIndex.ts)                                   | A partial index holding only revoked rows                              |

## What they teach

### Generated or written by hand

`pnpm migration:generate` compares the entities with the database and writes
the SQL to close the gap. It is right about the end state and blind to the
rows on the way there.

| Migration                  | What generate wrote                                   | Why it was rewritten                                                     |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| AlignSchema (2)            | DROP COLUMN `role`, ADD COLUMN `role`                 | Every user would lose their role. Converted in place with `USING`        |
| ProfileDisplayName (8)     | Drop the two name columns, add `displayName` NOT NULL | Fails on a table with rows. Backfill first, then NOT NULL                |
| RenameFamilyToSession (12) | DROP COLUMN `familyId`, ADD COLUMN `sessionId`        | Generate cannot tell a rename from a removal. `RENAME COLUMN` keeps rows |
| AddSessionTable (13)       | Drop three columns, add a key to an empty table       | Lost the data, and every existing token broke the new key                |

The rule from these: read every generated migration before running it. Mark
what you change with `// EDITED BY HAND:` and the reason. With no rows to
keep, as for `InitialSchema`, generated SQL is fine as it is.

Hand-written SQL has its own cost. CreateInitialSchema (1) chose readable
index names, and `migration:check` compares names, so AlignSchema (2) had to
rename them to the ones TypeORM derives.

### Indexes

| Index                                  | Kept? | Why                                                                                      |
| -------------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| Plain index on `username`, `email` (1) | No    | UNIQUE already builds one. A second only slows every write. Dropped in (4)               |
| `refresh_tokens_sid_idx` (15)          | Yes   | `isLive` looks a sign-in up by `sid` on every request                                    |
| `refresh_tokens_revoked_sid_idx` (16)  | Yes   | Partial: only revoked rows. A sign-in still going has none, so "any revoked?" is instant |

An index is a sorted copy of a column, pointing back at rows. It speeds
reads of that column and costs a little on every write. A partial index
(`WHERE "revoked"`) holds only the rows that match, so it stays small and
answers "is there one?" without reading the rest.

### Time: `timestamp` or `timestamptz`

| Type          | Stores               | Read back as                              |
| ------------- | -------------------- | ----------------------------------------- |
| `timestamp`   | A wall time, no zone | Whatever zone the reading machine guesses |
| `timestamptz` | The instant itself   | The same instant on every machine         |

TimestampsWithTimeZone (5) moved every column to `timestamptz`, after
`createdAt` came back three hours early on a laptop three hours ahead of UTC.
The app reads and writes these as ISO strings through `@northguild/gmt`.

### Case-insensitive text

`citext` is text that compares without regard to case. CaseInsensitiveUsernameAndEmail
(6) made `username` and `email` citext, so UNIQUE refuses "Walter" beside
"walter" and every `WHERE email = $1` matches any casing. It has no length,
so CHECK constraints hold the limits. ProfileDisplayName (8) did the same
for `displayName`. `citext` is an extension: a database must run
`CREATE EXTENSION citext` before a table can use it. `InitialSchema` does
that by hand, since entities cannot say it.

### Foreign keys: what a delete does

| Rule     | A delete of the parent row…       | Used for                                                                       |
| -------- | --------------------------------- | ------------------------------------------------------------------------------ |
| CASCADE  | deletes the child rows too        | `profile` → `user` (1)                                                         |
| RESTRICT | is refused while child rows exist | Token rows → `user` (11), so a hard delete cannot erase the record by accident |

The app soft-deletes (it sets `deletedAt`), which fires neither rule.
Since (14) the token tables hold `user_id` as text with no key at all, as the
NestJS docs do.

### Not signing anyone out

Most migrations that touched sign-ins carried a backfill so that members
stayed signed in: (9) left `passwordChangedAt` NULL, (13) filled `session`
from the token rows, (14) re-encoded every token hash from hex to base64url,
(15) gave each family a `sid`. That care is right once real members exist,
and it is most of what made these files long.

## The sign-in tables, side by side

The same facts, in four shapes:

| After | Tables                                       | One sign-in is…                                   | How an access token knows its sign-in              |
| ----- | -------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| (10)  | `refresh_token`                              | Every row sharing a `familyId`                    | It doesn't                                         |
| (13)  | `session`, `refresh_token` → `session`       | A `session` row                                   | `sid` claim = `session.id`                         |
| (14)  | `refresh_tokens`, `email_tokens`, `sessions` | Every row sharing a `family_id` (the docs' shape) | It doesn't (the docs accept 15 minutes)            |
| (15)  | the same, plus `refresh_tokens.sid`          | Every row sharing a `family_id`                   | `sid` claim, checked by `SignInsRepository.isLive` |

[TOKENS_AND_SESSIONS.md](TOKENS_AND_SESSIONS.md) explains the current shape.
