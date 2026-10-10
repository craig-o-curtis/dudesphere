# Three kinds of test

## TLDR description

This repo has three kinds of test file. They differ in how much of the app
they start. The less a test starts, the faster it runs and the less it can
prove.

## The three, side by side

|                                     | Unit spec                       | HTTP spec                                   | E2E spec                 |
| ----------------------------------- | ------------------------------- | ------------------------------------------- | ------------------------ |
| File name                           | `src/**/*.spec.ts`              | `src/**/*.http.spec.ts`                     | `test/*.e2e-spec.ts`     |
| Run with                            | `pnpm test`                     | `pnpm test`                                 | `pnpm test:e2e`          |
| Starts                              | One class                       | A small app: one controller, over real HTTP | The whole `AppModule`    |
| Fakes                               | Everything the class depends on | The services                                | Nothing                  |
| Needs the databases                 | No                              | No                                          | Yes, migrated and seeded |
| Pipes, interceptors and filters run | No                              | Yes                                         | Yes                      |
| Guards run                          | No                              | No                                          | Yes                      |

`pnpm test` runs the first two together, because `*.http.spec.ts` also
matches the `**/*.spec.ts` pattern in
[vitest.config.ts](../vitest.config.ts).

## What each one can prove

- **Unit spec:** logic. Each branch of a service, each rule on a DTO, what a
  guard's `canActivate` returns.
- **HTTP spec:** the status a request gets. A 400 from a pipe, a 408 from the
  time limit, the status a filter picks for a database error.
- **E2E spec:** that the pieces work together. A 401 or 403 from the real
  guards, and anything that depends on real rows.

## Why a unit spec cannot prove a 400

A unit spec calls the controller method directly:
`controller.getUserById({ id: 1 })`. That call goes straight to step 7 of the
[request lifecycle](NESTJS_REQUEST_LIFECYCLE.md). No pipe runs, so a bad id
is never refused. A test there that expects a 400 would prove nothing about
the pipe.

Only a real request runs the pipeline. That is what the HTTP spec is for.

## How to pick

1. Is the question about logic inside one class? Write a unit spec.
2. Is it about a status code, and can the services be fakes? Write an HTTP
   spec.
3. Does it need a guard, a token or real rows? Write an e2e spec.

## What the setup looks like

**EXISTING FILE:** a unit spec. It builds one service and hands it fakes.
Trimmed to three of its providers.

```ts
// src/users/users.service.spec.ts
const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: getRepositoryToken(User), useValue: usersRepository },
    { provide: HashingProvider, useValue: hashingProvider },
  ],
}).compile();
```

**EXISTING FILE:** an HTTP spec. It starts an app with one real controller
and a fake service.

```ts
// src/shared/dto/pg-id-param.http.spec.ts
const moduleFixture = await Test.createTestingModule({
  controllers: [UsersController],
  providers: [{ provide: UsersService, useValue: usersService }],
}).compile();

app = moduleFixture.createNestApplication();
configureApp(app);
await listenOnLoopback(app);
```

**EXISTING FILE:** an e2e spec. The last three lines are the same. The
difference is the first call, which loads the whole app.

```ts
// test/profile-me.e2e-spec.ts
const moduleFixture = await Test.createTestingModule({
  imports: [AppModule],
}).compile();

app = moduleFixture.createNestApplication();
configureApp(app);
await listenOnLoopback(app);
```

`configureApp` adds the same pipes, interceptors and filters that `main.ts`
adds. `listenOnLoopback` starts the app on a free port on `127.0.0.1`.

## Things to know before you write one

- **An HTTP spec has no guards.** It does not load `AppModule`, so the global
  guards are not registered. Where a handler needs the caller, a stand-in
  middleware sets `request.user`.
- **An e2e spec writes to your dev databases.** There is no separate test
  database. A cleanup job deletes what the suites wrote, and it finds those
  rows by their `e2e-` names. The rules are in "End-to-End Tests" in
  [DEVELOPMENT.md](../DEVELOPMENT.md).
- **The e2e suites run in the `Asia/Tokyo` time zone.**
  [vitest.config.e2e.ts](../vitest.config.e2e.ts) sets it, so a bug that only
  shows far from UTC cannot hide.
- **A fake is a plain object of `vi.fn()` functions**, registered with
  `useValue`. [NESTJS_PROVIDERS.md](NESTJS_PROVIDERS.md) explains `useValue`.

Docs: <https://docs.nestjs.com/fundamentals/testing>
