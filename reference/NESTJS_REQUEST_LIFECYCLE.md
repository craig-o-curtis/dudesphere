# NestJS request lifecycle

## TLDR description

Every request passes through the same steps in the same order. Each step can
end the request early with an error. So the order decides which status a bad
request gets.

The short form: middleware, guards, interceptors, pipes, the handler, the
interceptors again, and filters if anything threw.

## The order, with what this app runs at each step

Checked on `@nestjs/core` 12.0.4 by running an app with one piece of each kind
and logging when each one ran.

| Step | Kind                     | What this app runs there                                   | How it can end the request                             |
| ---- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------ |
| 1    | Middleware               | `requestId`                                                | It never does. It adds `x-request-id`.                 |
| 2    | Body parser              | Express reads the JSON body                                | 400 when the JSON does not parse                       |
| 3    | Route match              | Nest finds the handler for the URL                         | 404 when no route matches                              |
| 4    | Guards                   | `JwtAuthGuard`, then `RolesGuard`                          | 401 and 403                                            |
| 5    | Interceptors, going in   | `TimeoutInterceptor`, then `ClassSerializerInterceptor`    | 408 when steps 6 to 8 take over 10 seconds             |
| 6    | Pipes                    | `ValidationPipe`, and `ParseObjectIdPipe` on abiding ids   | 400                                                    |
| 7    | Handler                  | The controller method and the service it calls             | Whatever the service throws, such as 404 or 409        |
| 8    | Interceptors, coming out | `ClassSerializerInterceptor`, then `TimeoutInterceptor`    | They do not. The serializer drops `@Exclude()` fields. |
| 9    | Filters                  | `MongoErrorFilter`, `PgErrorFilter`, `AllExceptionsFilter` | They write the error response                          |

Step 9 runs only when an earlier step threw. An error from any of steps 2 to 8
lands there.

## What the order tells you

- **No token and a bad body gets 401, not 400.** Guards run before pipes.
- **Malformed JSON and no token gets 400, not 401.** The body parser runs
  before guards.
- **A URL that does not exist gets 404, not 401.** Nest matches the route
  before it runs a guard.
- **A handler never sees a value its DTO refuses.** The pipe throws first.
- **A throw skips the rest.** When a guard refuses a request, no interceptor,
  pipe or handler runs.
- **The time limit does not cover the guards.** The clock starts at step 5.
- **Every error response carries `x-request-id`.** The middleware runs first,
  so the header is set before anything can fail.
- **A pipe runs once for each decorated parameter.** A handler with no
  `@Body()`, `@Param()` or `@Query()` runs no pipe at all.

## When there are several of one kind

Guards, pipes and interceptors going in run global first, then controller,
then route. Interceptors coming out and filters run the other way: route,
controller, global.

Nearly everything in this app is global, so the order inside a kind is the
order of registration:

- **Guards** run in the order `providers` lists them in
  [src/app.module.ts](../src/app.module.ts). `JwtAuthGuard` puts the user on
  the request, then `RolesGuard` reads it.
- **Interceptors** run in the order `useGlobalInterceptors` receives them in
  [src/app-setup.ts](../src/app-setup.ts). The first one wraps the rest, so it
  goes in first and comes out last.
- **Filters** are tried last to first. The catch-all is listed first, so Nest
  tries it last.

## Where each piece is explained

- Middleware: [src/shared/middleware/README.md](../src/shared/middleware/README.md)
- Guards: [src/shared/guards/README.md](../src/shared/guards/README.md)
- Interceptors: [src/shared/interceptors/README.md](../src/shared/interceptors/README.md)
- Pipes and DTOs: [src/shared/dto/README.md](../src/shared/dto/README.md) and
  [CLASS_VALIDATOR_DECORATORS.md](CLASS_VALIDATOR_DECORATORS.md)
- Filters: [src/shared/filters/README.md](../src/shared/filters/README.md)

Docs: <https://docs.nestjs.com/faq/request-lifecycle>
