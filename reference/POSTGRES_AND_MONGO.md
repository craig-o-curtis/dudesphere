# PostgreSQL and MongoDB, and why each has its own tool

## TLDR description

This app has two databases, and each one is reached through a different
library:

- **PostgreSQL through TypeORM** holds users and their profiles.
- **MongoDB through Mongoose** holds abidings and the hashtag registry.

Nothing in either database links the two. An abiding names its author with a
plain number, `userId`, and the app joins them in code.

TypeORM can also talk to MongoDB, so one library for both is possible. The app
does not do that, because Mongoose does three jobs on every read and write
that TypeORM leaves to you: it checks values against the schema, it converts
query values to the stored type, and it stamps `createdAt` and `updatedAt`.

## Two kinds of database

The two store data in different ways, and that is the reason the code around
them looks different.

| Question                   | PostgreSQL, a relational database            | MongoDB, a document database                          |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| What is one record?        | A row in a table                             | A document in a collection                            |
| Who decides its shape?     | The database. A column has a type and rules. | The app. The database stores whatever it is given.    |
| How do records link?       | A foreign key, which the database checks     | A value the app stores and looks up itself            |
| How are links read?        | A join, done by the database                 | A second query, or an array kept inside the document  |
| How does the shape change? | A migration: a script that alters the tables | The code changes. Old documents keep their old shape. |
| Can several writes be one? | Yes, a transaction, and this app uses them   | Possible, but this app does not use them              |

The second row is the one to remember. Postgres refuses a bad value by
itself. Mongo does not, so something in the app has to. Here that is Mongoose.

## What lives where

| Data             | Database   | Library  | Folder         | Why it is there                                                   |
| ---------------- | ---------- | -------- | -------------- | ----------------------------------------------------------------- |
| Users            | PostgreSQL | TypeORM  | `src/users`    | Emails and usernames must be unique, and the database enforces it |
| Profiles         | PostgreSQL | TypeORM  | `src/profiles` | One per user, tied to it by a foreign key                         |
| Abidings         | MongoDB    | Mongoose | `src/abidings` | Many short posts, read as lists, each carrying its own tags       |
| Hashtag registry | MongoDB    | Mongoose | `src/hashtags` | One document per tag, looked up by its slug                       |

The README calls this a demo application with both databases. Showing the two
side by side is part of its purpose.

## The same idea, two sets of words

Most ideas exist on both sides under different names. This table is the
quickest way to find your way around the other half of the code.

| Idea                        | PostgreSQL with TypeORM                         | MongoDB with Mongoose                              |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| The class that describes it | An entity, `user.entity.ts`                     | A schema, `abiding.schema.ts`                      |
| Where records are kept      | A table                                         | A collection                                       |
| The id                      | A whole number                                  | An `ObjectId`, 24 hex characters                   |
| Checking an id from the URL | `PgIdParamDto`                                  | `ParseObjectIdPipe`                                |
| What a service injects      | A repository, with `@InjectRepository`          | A model, with `@InjectModel`                       |
| Registering it in a module  | `TypeOrmModule.forFeature([User])`              | `MongooseModule.forFeature([...])`                 |
| One page of a list          | `PaginationProvider.paginatePgQuery`            | `PaginationProvider.paginateMongoModel`            |
| Changing the shape          | A migration, in `src/database/migrations`       | No migrations. See "Mongo Schema Changes".         |
| Indexes                     | Written in a migration                          | Declared on the schema, built when the app starts  |
| Soft delete                 | A `deletedAt` column TypeORM filters on         | A `deletedAt` field every query filters on by hand |
| A database error becomes    | A status in `PgErrorFilter`                     | A status in `MongoErrorFilter`                     |
| A query that runs too long  | `statement_timeout`, set in `src/app.module.ts` | `timeoutMS`, set in `src/app.module.ts`            |

## How the two are joined

No foreign key crosses from one database to the other, and no transaction
covers both. The app does that work itself, in three places.

**Reading an author's name.** An abiding stores `userId` and no username. A
copied name would go stale the first time the user renamed. So
`AbidingsService` reads a page of abidings from Mongo, then asks Postgres once
for the authors of that page, and puts each name on its abidings. See
`withUsernames` in `src/abidings/abidings.service.ts`.

**Posting.** Before it writes an abiding, `createAbiding` checks in Postgres
that the author still exists. A foreign key would do this in one database.
Across two, the code has to.

**Deleting a user.** `deleteUser` in `src/users/users.service.ts` soft-deletes
the user and the profile inside one Postgres transaction, then hides that
user's abidings in Mongo. Mongo goes last on purpose:

- If a Postgres step fails, the transaction rolls back and Mongo was never
  touched.
- If the Mongo step fails, it throws, and that rolls the Postgres steps back.

The order is what keeps the two in step. It is not as strong as one
transaction, which is the price of two databases.

## Why Mongoose and not TypeORM for MongoDB

Checked on `typeorm` 1.1.1 and `mongoose` 9.10.2, by reading the TypeORM
source.

| Job                                      | Where this app relies on it                                                   | What TypeORM does for MongoDB                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Check a value against the schema         | Creating an abiding, and editing one with `runValidators`                     | Nothing. Raw updates go straight to the driver.               |
| Convert a query value to the stored type | The date filter sends dates as strings. Every lookup sends `_id` as a string. | Nothing. A date sent as a string never matches a stored date. |
| Stamp `createdAt` and `updatedAt`        | Every write, including raw updates and the hashtag `bulkWrite`                | Only when an entity is saved whole                            |

Three more facts point the same way:

- **It is the documented Nest route.** The Nest docs say MongoDB works through
  TypeORM or through Mongoose, then describe only Mongoose, with
  `@nestjs/mongoose`.
- **TypeORM has no MongoDB transactions.** The three transaction methods in its
  Mongo query runner are empty.
- **The queries would not become alike.** TypeORM's operators, such as `In` and
  `MoreThan`, are for SQL only. A Mongo query through TypeORM still uses `$in`
  and `$gte`.

The second job matters most here. This repo bans `Date` in app code. Mongoose
turning a date string into a stored date is what lets the date filter on
`GET /abidings` keep that rule.

### What a move to TypeORM would cost

It is possible. The estimate is about a week, most of it rewriting tests:

- 13 source files and 13 test files use Mongoose.
- Two entities, three services, two seeds and `paginateMongoModel` would be
  rewritten.
- New code would replace what Mongoose did: write validation, timestamps, an
  id pipe and the Mongo error filter.

The gain would be one library name and one pagination method. That is less
than what would be lost, so the app keeps Mongoose.

If the wish is ever one data layer for real, the move that delivers it is a
different one: put abidings and hashtags in Postgres. That gives joins, foreign
keys and transactions, and it ends the two-database demo.

## Where a new piece of data should go

- **Put it in Postgres** when one end of it is a user, or when the database
  must refuse a duplicate or a dangling link. "Who follows which tag" is the
  example in `context/overview.md`.
- **Put it in Mongo** when it hangs off an abiding, is read as a list, and can
  carry its own related values in an array, as `hashtags` does.
- **Do not store a count in one database about rows in the other.** With no
  transaction across both, the count will drift.

## Things to try

Each one takes a few minutes and makes a point from this page concrete.

1. **See the only link.** Open pgAdmin and Mongo Express, as `DEVELOPMENT.md`
   describes. Find one user's row, then find their abidings. The number in
   `userId` is all that connects them.
2. **Read the two classes side by side.** Open `src/users/user.entity.ts` and
   `src/abidings/abiding.schema.ts`. Find where each one says a field is
   required, and where each one sets its timestamps.
3. **Watch Mongoose convert a value.** In `src/abidings/abiding.service.spec.ts`,
   read "filtering by date": the service puts strings in the filter. Then read
   "filtered by a date range" in `test/pagination.e2e-spec.ts`: a real Mongo
   compares them as dates.
4. **Break the join in your head.** Read `deleteUser` in
   `src/users/users.service.ts`. Work out what a caller sees, and what each
   database holds, if Mongo is down when it runs.

## Where to read more

- The tables, the collections and why there is no join table:
  [context/overview.md](../context/overview.md)
- Changing a Mongo schema or an index with no migrations: "Mongo Schema
  Changes" in [DEVELOPMENT.md](../DEVELOPMENT.md)
- Paging a list from either database:
  [src/shared/pagination/README.md](../src/shared/pagination/README.md)
- What each database error becomes:
  [DATABASE_ERROR_CODES.md](./DATABASE_ERROR_CODES.md)
