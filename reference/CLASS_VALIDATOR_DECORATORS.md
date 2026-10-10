# class-validator decorators

## TLDR description

A DTO field carries decorators that say what a valid value is. The global
`ValidationPipe` runs them on every `@Body()`, `@Query()` and `@Param()` typed
with a DTO class. When a value fails, the caller gets a 400 that lists each
problem, and the handler never runs.

## The validators this app uses

Checked on `class-validator` 0.15.1 by running each one on sample values.

| Decorator                        | Passes                         | Rejects                                    |
| -------------------------------- | ------------------------------ | ------------------------------------------ |
| `@IsString()`                    | Any string, `""` included      | A number, `null`, a missing field          |
| `@IsNotEmpty()`                  | Anything else, `"  "` included | `""`, `null`, a missing field              |
| `@MinLength(n)`, `@MaxLength(n)` | A string of that length        | A shorter or longer string, any non-string |
| `@IsInt()`                       | A whole number                 | `"5"`, `5.5`, `NaN`                        |
| `@Min(n)`, `@Max(n)`             | A number inside the limit      | A number outside it, any string            |
| `@IsBoolean()`                   | `true`, `false`                | `"true"`, `1`                              |
| `@IsEmail()`                     | `a@b.co`                       | `a@b`                                      |
| `@IsUrl()`                       | `https://x.io/a.png`, `x.io`   | `http://localhost:3000`                    |
| `@IsByteLength(min, max)`        | A string of that many bytes    | `"abcde"` for a minimum of 6               |
| `@ValidateNested()`              | An object whose own rules pass | An object with a bad field inside          |

Two more do no checking of their own. They decide whether the other rules on
the field run:

- `@IsOptional()` skips them when the value is `null` or missing.
- `@ValidateIf(fn)` skips them when `fn` returns false.

## Traps

- **`@IsString()` passes an empty string.** Add `@IsNotEmpty()`.
- **`@IsNotEmpty()` passes a string of spaces.**
- **`@IsInt()` rejects `"5"`.** Query and URL values arrive as strings. Put
  `@Type(() => Number)` on the field to convert it first.
- **`@Type(() => Number)` reads more than digits.** `"0x10"` becomes 16,
  `"1e1"` becomes 10 and `"+5"` becomes 5. Where one value should have one
  spelling, use `@IntFromDigits()` from `src/shared/decorators`, as
  `PgIdParamDto` and `PaginationQueryDto` do.
- **`@IsInt()` has no upper limit.** `1e20` passes. Add `@Max`.
- **`@IsUrl()` rejects a `localhost` URL** and passes one with no `https://`.
- **`@IsByteLength` counts bytes, not characters.** `"ééé"` is 6 bytes.
- **`@ValidateNested()` needs `@Type(() => TheClass)` beside it.**
- **A field with no decorator is refused.** The pipe treats it as unknown and
  answers `property x should not exist`.

## Three kinds of optional

| You want                        | Use                                              | Missing | `null`  |
| ------------------------------- | ------------------------------------------------ | ------- | ------- |
| Optional, and `null` is fine    | `@IsOptional()`                                  | Skipped | Skipped |
| Optional, but `null` is refused | `@ValidateIf((_, value) => value !== undefined)` | Skipped | 400     |
| Required                        | Neither                                          | 400     | 400     |

Use the first for a column that can be `NULL`. Use the second for a column
that is `NOT NULL`. With `@IsOptional()` on a `NOT NULL` column, a `null`
passes the DTO and fails in Postgres.

`PartialType(CreateDto)` makes every field optional in the first sense.
`PartialType(CreateDto, { skipNullProperties: false })` skips a missing field
only, so each field keeps its own rule about `null`. The update DTOs in this
app all pass that option.

## The three pipe options

Set once in [src/app-setup.ts](../src/app-setup.ts).

| Option                       | What it does                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `whitelist: true`            | Drops any property that has no decorator on the DTO.                                               |
| `forbidNonWhitelisted: true` | Answers 400 for such a property, where `whitelist` alone would drop it without a word.             |
| `transform: true`            | Hands the handler an instance of the DTO class, with the values `@Type` and `@Transform` produced. |

The pipe does not guess types. `?limit=7` stays the string `"7"` unless the
field converts it, with `@Type(() => Number)`, a `@Transform`, or this app's
`@IntFromDigits()`.

## One field, read line by line

**EXISTING FILE:** the `limit` field of the shared paging query, comments
left out.

```ts
// src/shared/pagination/dto/pagination-query.dto.ts
@IsOptional()
@IntFromDigits(DEFAULT_LIMIT)
@Min(1)
@Max(MAX_LIMIT)
limit: number = DEFAULT_LIMIT;
```

1. `@IsOptional()`: `limit` may be missing. Then it keeps the default, 10.
2. `@IntFromDigits(DEFAULT_LIMIT)` does two things. It converts: the string
   `"7"` becomes the number 7, and anything that is not plain digits becomes
   `NaN`. Then it applies `@IsInt()`, which refuses `NaN`. So `abc`, `1.5`,
   `0x10` and `1e1` all get a 400. It is defined in
   `src/shared/decorators/int-from-digits.decorator.ts`.
3. `@Min(1)` and `@Max(MAX_LIMIT)`: it must be from 1 to 100.

## What the 400 looks like

`message` is a list, one line for each rule that failed:

```json
{
  "message": ["name must be a string", "name should not be empty"],
  "error": "Bad Request",
  "statusCode": 400
}
```

A nested field carries its path: `profile.firstName must be a string`.

## This app's own validators

`@MaxCodePoints(n)`, `@NoNulCharacter()` and `@IsUtcDateTime()` are explained
in [src/shared/decorators/README.md](../src/shared/decorators/README.md).

[src/config/env.validate.ts](../src/config/env.validate.ts) uses the same
library to check the environment variables at startup. `@IsIn` and `@Matches`
appear only there.

Docs: <https://github.com/typestack/class-validator#validation-decorators>
