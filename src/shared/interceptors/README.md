# NestJS Interceptors

## TLDR description

An interceptor wraps a route handler. It runs code before the handler, and it
can change, replace or cut short what the handler returns. Guards run before
it, and pipes run after it.

## In this folder

- `timeout.interceptor.ts` holds `TimeoutInterceptor`. It gives every request
  a time limit, `REQUEST_TIMEOUT_MS`, which is 10 seconds.
  - A handler that answers in time is passed through untouched.
  - A handler that takes longer is cut off. The caller gets a 408, and one
    warning is logged with the route and the request id.
  - On its own it ends the wait, not the work. The two database limits below
    do the stopping.
- `timeout.interceptor.spec.ts` tests it alone, and
  `timeout.interceptor.http.spec.ts` tests it over HTTP.

## The same limit in three places

`src/app.module.ts` gives each database the same number of milliseconds:

- **Postgres** cancels any statement that runs longer (`statement_timeout`).
- **The Mongo driver** stops any operation that runs longer (`timeoutMS`).

So a stuck query is stopped and its connection is freed, where before it kept
running after the caller had been answered. Whichever of the three limits
trips first, the caller gets the same 408: the database filters turn a
cancelled query into it. A statement that had already finished is still
written, so a caller who gets a 408 cannot assume nothing happened.

Migrations are not limited. They use `src/database/data-source.ts`, not the
app's connection.

Mongo's `serverSelectionTimeoutMS` is 5 seconds, less than the limit. That way
a Mongo outage reaches `MongoErrorFilter` and answers 503 before anything
would answer 408.

## Where it is wired in

`configureApp` in `src/app-setup.ts` registers it with
`app.useGlobalInterceptors(...)`, first in the list, so it wraps the
serializer and the handler.
