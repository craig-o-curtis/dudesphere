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
  - It ends the wait, not the work. The handler keeps running after the 408
    goes out, so a caller cannot assume nothing was written.
- `timeout.interceptor.spec.ts` tests it alone, and
  `timeout.interceptor.http.spec.ts` tests it over HTTP.

Mongo's `serverSelectionTimeoutMS` in `src/app.module.ts` is 5 seconds, less
than the limit here. That way a Mongo outage reaches `MongoErrorFilter` and
answers 503 before this interceptor would answer 408.

## Where it is wired in

`configureApp` in `src/app-setup.ts` registers it with
`app.useGlobalInterceptors(...)`, first in the list, so it wraps the
serializer and the handler.
