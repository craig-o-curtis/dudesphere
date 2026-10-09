# NestJS Exception Filters

## TLDR description

An exception filter catches an error that nothing else caught and turns it into
the HTTP response. `@Catch(SomeError)` names the errors a filter handles.
`@Catch()` with no argument handles all of them.

## In this folder

- `all-exceptions.filter.ts` is the catch-all. It leaves the response as Nest
  writes it, `{ statusCode, message, error }`, plus `errorCode` when the throw
  set one. It adds one log line for every 5xx: the route, the user and the
  request id. It changes one response: when a database cannot be reached and
  its driver throws a plain `Error`, this filter answers with a 503.
- `query-failed.filter.ts` handles Postgres errors. A unique violation (code
  `23505`) becomes a 409. A connection lost while a query ran becomes a 503.
  Every other database error stays a 500, logged without the values the query
  ran with.
- `mongo-error.filter.ts` handles Mongo errors. A duplicate key (code `11000`)
  becomes a 409. Mongo being unreachable becomes a 503. The rest stay a 500.
- `database-unavailable.ts` holds what the three share: the test for "the
  database cannot be reached" and the one 503 body, with `DATABASE_UNAVAILABLE`.

## The built-in exceptions need no filter

`NotFoundException`, `ConflictException`, `RequestTimeoutException` and the
rest of Nest's built-in HTTP exceptions all extend `HttpException`. Nest
answers each with its own status and body wherever it is thrown. The filters
here exist for errors that are not `HttpException`s, such as a database
driver's.

The two database filters extend `AllExceptionsFilter`, so their 500s get the
same log line.

## Where they are wired in

`configureApp` in `src/app-setup.ts` registers global filters with
`app.useGlobalFilters(...)`. Nest tries global filters last to first, so the
catch-all goes first in the list and the specific filters after it.
