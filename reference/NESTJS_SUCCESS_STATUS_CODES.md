# NestJS success status codes

## TLDR description

When a handler returns without throwing, Nest picks the status from the HTTP
method. A `POST` gets 201. Every other method gets 200. Put `@HttpCode(n)` on
a handler to send a different one.

[NESTJS_EXCEPTIONS.md](NESTJS_EXCEPTIONS.md) covers the other half: the status
a request gets when something goes wrong.

## The default for each method

Checked on `@nestjs/common` 12.0.4 by sending real requests to a small app.

| Decorator   | Default status |
| ----------- | -------------- |
| `@Get()`    | 200            |
| `@Post()`   | 201            |
| `@Put()`    | 200            |
| `@Patch()`  | 200            |
| `@Delete()` | 200            |

## The three success codes worth knowing

| Code | Name       | What it tells the caller               |
| ---- | ---------- | -------------------------------------- |
| 200  | OK         | It worked. The result is in the body.  |
| 201  | Created    | It worked, and a new thing now exists. |
| 204  | No Content | It worked. There is no body to read.   |

## What the handler returns decides the body

| The handler returns   | Body                | `Content-Type`     |
| --------------------- | ------------------- | ------------------ |
| An object or an array | JSON                | `application/json` |
| A string              | The string as it is | `text/html`        |
| Nothing, or `null`    | Empty               | None               |

The status does not change with the return value. A `@Delete()` handler that
returns nothing still answers 200, with an empty body. It answers 204 only
with `@HttpCode(204)`.

## How to change the status

**EXISTING FILE:** a delete that answers 204, and a `POST` that answers 200.

```ts
// src/users/users.controller.ts
@Delete("me")
@HttpCode(204) // needs 204 No Content instead of default 200 OK
deleteMe(@CurrentUser() user: AuthUser): Promise<void> {}

@Post(":id/restore")
@HttpCode(200) // uses 200 OK instead of Nest default 201 Created
restoreUser(@Param() { id }: IdParamDto): Promise<UserResponseDto> {}
```

Restore is a `POST` that creates nothing, so 201 would be wrong for it.

## What this app answers

| Route                                                     | Status | Set by           |
| --------------------------------------------------------- | ------ | ---------------- |
| Every `GET` and `PATCH`                                   | 200    | The default      |
| `POST /users`, `POST /abidings`                           | 201    | The default      |
| `POST /auth`                                              | 201    | The default      |
| `POST /users/:id/restore`, `POST /hashtags/:slug/restore` | 200    | `@HttpCode(200)` |
| Every `DELETE`                                            | 204    | `@HttpCode(204)` |

Every delete answers 204. A new delete route needs `@HttpCode(204)` too, or
it answers 200 with an empty body.

Login, `POST /auth`, answers 201. It is a `POST` with no `@HttpCode`.

Docs: <https://docs.nestjs.com/controllers#status-code>
