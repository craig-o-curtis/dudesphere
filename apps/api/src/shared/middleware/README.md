# NestJS Middleware

## TLDR description

Middleware is a function that runs on a request before Nest picks a route.
It sees the raw request and response, can change either, and calls `next()` to
pass the request on.

It does not know which handler will run. For a rule that depends on the route,
use a guard.

## In this folder

- `request-id.middleware.ts` holds `requestId`. It gives every request an
  `x-request-id`.
  - It keeps the caller's id when that id matches `[A-Za-z0-9._-]{1,64}`.
  - Otherwise it makes a fresh UUID.
  - It sets the id on the request and on the response header.
- `request-id.middleware.spec.ts` tests it.

`AllExceptionsFilter` logs the id on every 5xx. A caller who reports a failure
can quote the header, and you can find the log line.

## Where it is wired in

`configureApp` in `src/app-setup.ts` calls `app.use(requestId)` first, so
guards, pipes and filters all see the id.
