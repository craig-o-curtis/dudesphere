# Database error codes

## TLDR description

When a database refuses a query, its driver throws an error with a code. That
error is not an `HttpException`, so Nest alone would answer 500 for all of
them. Two filters read the code and pick a better status where one exists.

[NESTJS_EXCEPTIONS.md](NESTJS_EXCEPTIONS.md) covers the errors you throw. This
lesson covers the errors a database throws.

## How to read a Postgres code

A Postgres code is five characters and is called a SQLSTATE. The first two
are its class:

| Class | Meaning                        |
| ----- | ------------------------------ |
| `08`  | The connection failed.         |
| `22`  | A value is wrong for its type. |
| `23`  | A constraint was broken.       |
| `42`  | The SQL itself is wrong.       |

The `pg` driver puts the code on `error.code`. TypeORM wraps that error in a
`QueryFailedError`, and `QueryFailedFilter` reads the code from it.

## Postgres codes this app gives a better status

Each code from `23505` to `22P05` was raised against Postgres 18.6 to confirm
it. The outage codes in the last three rows were not raised. Their names are
the ones `database-unavailable.ts` gives.

| Code                      | Postgres name                                            | How to cause it                                | Status here                 |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| `23505`                   | `unique_violation`                                       | Insert a second row with the same unique value | 409, `VALUE_TAKEN`          |
| `22001`                   | `string_data_right_truncation`                           | Put 25 characters in a `varchar(24)`           | 400                         |
| `22007`                   | `invalid_datetime_format`                                | Send `not-a-date` as a timestamp               | 400                         |
| `22008`                   | `datetime_field_overflow`                                | Send `2026-02-30` as a date                    | 400                         |
| `22021`                   | `character_not_in_repertoire`                            | Put the NUL character in text                  | 400                         |
| `22P02`                   | `invalid_text_representation`                            | Send `abc` where a number or enum goes         | 400                         |
| `22P05`                   | `untranslatable_character`                               | Put `\u0000` in `jsonb`                        | 400                         |
| `57P01`, `57P02`, `57P03` | `admin_shutdown`, `crash_shutdown`, `cannot_connect_now` | Query while Postgres stops or starts           | 503, `DATABASE_UNAVAILABLE` |
| `53300`                   | `too_many_connections`                                   | Open more connections than Postgres allows     | 503, `DATABASE_UNAVAILABLE` |
| `08xxx`                   | Class `connection_exception`                             | Lose the connection                            | 503, `DATABASE_UNAVAILABLE` |

Every 400 in this table is also a bug report. A DTO should have refused the
value before any query ran. The filter logs a warning with the route, so you
can find the field and add the missing rule.

## Postgres codes that stay 500

Any code not in the table above stays a 500. Three are left out on purpose,
and [src/shared/filters/invalid-value.ts](../src/shared/filters/invalid-value.ts)
says why:

| Code    | Postgres name                | Why it stays 500                                                                                          |
| ------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `23502` | `not_null_violation`         | If the code forgets to set a new `NOT NULL` column, every insert raises it. A 400 would hide that outage. |
| `22003` | `numeric_value_out_of_range` | A full id sequence raises it too. `IdParamDto` already stops the caller's case.                           |
| `22012` | `division_by_zero`           | It points at our SQL, not at the caller's value.                                                          |

These have no rule, and all were raised against Postgres 18.6 too:

| Code    | Postgres name           | What it usually means                                       |
| ------- | ----------------------- | ----------------------------------------------------------- |
| `23503` | `foreign_key_violation` | A row points at a parent row that does not exist.           |
| `23514` | `check_violation`       | A value broke a `CHECK` rule on the table.                  |
| `42P01` | `undefined_table`       | The table is missing. Most often, a migration has not run.  |
| `42703` | `undefined_column`      | The column is missing. Most often, a migration has not run. |
| `42601` | `syntax_error`          | The SQL does not parse.                                     |

## An outage with no SQLSTATE

When Postgres cannot be reached at all, there is no server to send a
SQLSTATE. Node raises a socket error, and `pg` passes it on as a plain
`Error`. `AllExceptionsFilter` answers 503 for these codes: `ECONNREFUSED`,
`ECONNRESET`, `ETIMEDOUT`, `EHOSTUNREACH`, `ENOTFOUND` and `EPIPE`. It does
the same for an error whose message starts with `Connection terminated`.

## Mongo

`MongoErrorFilter` matches by error class. It reads a numeric code for one
case only.

| Error                                            | Meaning                                       | Status here                 |
| ------------------------------------------------ | --------------------------------------------- | --------------------------- |
| `MongoServerError`, code `11000`                 | A duplicate key on a unique index             | 409, `VALUE_TAKEN`          |
| `MongoNetworkError`, `MongoServerSelectionError` | Mongo cannot be reached                       | 503, `DATABASE_UNAVAILABLE` |
| Mongoose `ValidationError`                       | A value broke a rule in a schema              | 400                         |
| Mongoose `CastError`                             | A value cannot become the type its path needs | 400                         |
| Any other `MongoServerError`                     | A fault                                       | 500                         |

The two Mongoose errors are raised by Mongoose itself, before the query
reaches Mongo.

## Where the code lives

- [src/shared/filters/query-failed.filter.ts](../src/shared/filters/query-failed.filter.ts)
  maps the Postgres codes.
- [src/shared/filters/invalid-value.ts](../src/shared/filters/invalid-value.ts)
  holds the list of codes that become a 400.
- [src/shared/filters/database-unavailable.ts](../src/shared/filters/database-unavailable.ts)
  holds the test for "cannot be reached" and the one 503 body.
- [src/shared/filters/mongo-error.filter.ts](../src/shared/filters/mongo-error.filter.ts)
  maps the Mongo errors.

Docs: <https://www.postgresql.org/docs/current/errcodes-appendix.html>
