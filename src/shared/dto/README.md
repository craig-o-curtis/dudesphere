# NestJS DTOs

## TLDR description

A DTO (data transfer object) is a class that describes the shape of data going
into or out of a route. The global `ValidationPipe` checks incoming data against
the `class-validator` decorators on the class. Data that does not fit gets a 400.

A DTO used by one feature lives in that feature, such as `src/users/dto`.
This folder holds the ones several features share.

## In this folder

- `id-param.dto.ts` holds `IdParamDto`, the `:id` in the URL for routes backed
  by a Postgres row (`user`, `profile`). It accepts digits only, from 1 to
  2,147,483,647, the largest Postgres `integer`. Anything else is a 400.
- `id-param.http.spec.ts` tests it over HTTP.

## How to use it

```ts
@Get(":id")
getUserById(@Param() { id }: IdParamDto) {}
```

Mongo-backed routes do not use it. Their ids go through `ParseObjectIdPipe`,
or the route is keyed by a slug.
