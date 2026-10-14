# NestJS providers

## TLDR description

A provider is anything Nest can hand to a constructor: a service, a
repository, a config object. You register it under a token. A class asks for
that token in its constructor, and Nest supplies the value.

Most of the time the token is the class itself. `providers: [UsersService]`
is the short form of:

```ts
providers: [{ provide: UsersService, useClass: UsersService }];
```

The long form lets the token and the thing behind it differ.

## Four ways to say what stands behind a token

| Key           | Nest supplies                                                             | Where this app uses it                                                                                                |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `useClass`    | A new instance of that class, with its own dependencies filled in         | `MailModule`, and the `APP_GUARD` line in `AppModule`                                                                 |
| `useValue`    | The exact value you give                                                  | Every test that passes a fake                                                                                         |
| `useFactory`  | Whatever the function returns. `inject` lists what the function receives. | The options for `TypeOrmModule`, `MongooseModule`, `ThrottlerModule` and `AuthenticationModule`                       |
| `useExisting` | A provider that is already registered, under a second name                | Not in this app's code. `AuthenticationModule` and `AuthorizationModule` use it to put their guards under `APP_GUARD` |

**EXISTING FILE:** `useClass`, with a token that is not the class behind it.

```ts
// src/mail/mail.module.ts
@Module({
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [{ provide: MailProvider, useClass: SmtpMailProvider }],
  exports: [MailProvider],
})
export class MailModule {}
```

`PasswordResetMailer` asks for `MailProvider` and never names SMTP. Changing
how mail is sent means writing one new class and changing that one line.
[src/mail/mail.provider.ts](../src/mail/mail.provider.ts) holds the token,
and [src/mail/smtp-mail.provider.ts](../src/mail/smtp-mail.provider.ts) the
class behind it.

**EXISTING FILE:** `useFactory` with `inject`, comments left out.

```ts
// src/app.module.ts
AuthenticationModule.forRootAsync({
  imports: [ConfigModule.forFeature(authConfig)],
  inject: [authConfig.KEY],
  useFactory: (auth: ConfigType<typeof authConfig>) => ({
    accessToken: {
      key: auth.secret,
      alg: "HS256",
    },
  }),
});
```

Nest looks up `authConfig.KEY`, passes the result to the function as `auth`,
and uses what the function returns. The real factory returns more options.

## What a token can be

| Token                    | How a class asks for it     | Example here                                            |
| ------------------------ | --------------------------- | ------------------------------------------------------- |
| A class                  | By type alone               | `private readonly usersService: UsersService`           |
| An abstract class        | By type alone               | `private readonly mailProvider: MailProvider`           |
| A string or symbol       | `@Inject(TOKEN)`            | `inject: [postgresConfig.KEY]` in a factory             |
| A token a library builds | The library's own decorator | `@InjectRepository(User)`, `@InjectModel(Abiding.name)` |

An interface cannot be a token. TypeScript removes interfaces when it
compiles, so nothing is left at runtime for Nest to look up. An abstract
class survives, which is why `MailProvider` is one.

Some constructors here name a class token with `@Inject` as well.
[src/auth/password-reset.mailer.ts](../src/auth/password-reset.mailer.ts)
writes `@Inject(MailProvider) private readonly mailProvider: MailProvider`.
`pnpm seed:run` builds the app through tsx, which emits no constructor
types, so Nest could not read the type there. Anywhere else, the type alone
is enough.

## Modules decide who can see a provider

A provider is private to the module that lists it. Two lines make it visible
to another module:

1. The owning module lists it in `exports`.
2. The other module lists the owning module in `imports`.

`MailModule` exports `MailProvider`. `AuthModule` imports `MailModule`. So
`PasswordResetMailer`, which `AuthModule` lists, can ask for `MailProvider`.

Miss either line and the app stops at startup with this error, shortened
here to one constructor argument:

```text
Nest can't resolve dependencies of the PasswordResetMailer (?). Please make
sure that the argument MailProvider at index [0] is available in the
AuthModule module.
```

The `?` marks the constructor argument Nest could not fill. The real message
lists every argument and gives the position of the missing one.

Three more things about visibility:

- **A global module needs no import.** `ConfigModule` is registered with
  `isGlobal: true`, and `AuthenticationModule` is global unless told
  otherwise. So `UsersService` asks for `PasswordHasher`, a class from
  `@nestjs/authentication`, and `UsersModule` imports nothing for it.
- **A module can export a module.** `UserAbidingsModule` exports
  `MongooseModule`, so a module that imports it can inject the `Abiding`
  model.
- **Two modules must not import each other.** This app avoids that by moving
  the shared part into a third module. `UserAbidingsModule` was split out of
  `AbidingsModule` for that reason.

## `APP_GUARD` is a token Nest reads

**EXISTING FILE:** the app's own global guard, comments left out.

```ts
// src/app.module.ts
providers: [
  AppService,
  { provide: APP_GUARD, useClass: AuthThrottlerGuard },
],
```

Nest runs every provider registered under `APP_GUARD` as a global guard.
Registered this way, a guard can have dependencies of its own.
[`AuthThrottlerGuard`](../src/auth/auth-throttler.guard.ts) gets the
throttler's options and storage. A guard created with `new` cannot.

The other two global guards are not in that list. `AuthenticationModule`
registers `AuthenticationGuard` under `APP_GUARD`, and `AuthorizationModule`
registers `AuthorizationGuard`. Each does it with `useExisting`, inside the
package. AppModule's own guards run before those of the modules it imports, so
the order is `AuthThrottlerGuard`, `AuthenticationGuard`,
`AuthorizationGuard`. [NESTJS_REQUEST_LIFECYCLE.md](NESTJS_REQUEST_LIFECYCLE.md)
shows where guards sit among the other steps.

## Tests swap the thing behind a token

A test registers a fake under the real token with `useValue`. The class under
test asks for `UsersService` and gets the fake.
[THREE_KINDS_OF_TESTS.md](THREE_KINDS_OF_TESTS.md) shows the setup.

Docs: <https://docs.nestjs.com/fundamentals/custom-providers>
