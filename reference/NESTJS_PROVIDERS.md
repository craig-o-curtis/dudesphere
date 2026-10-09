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

| Key           | Nest supplies                                                             | Where this app uses it                                            |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `useClass`    | A new instance of that class, with its own dependencies filled in         | `HashingModule`, and the two `APP_GUARD` lines in `AppModule`     |
| `useValue`    | The exact value you give                                                  | Every test that passes a fake                                     |
| `useFactory`  | Whatever the function returns. `inject` lists what the function receives. | The options for `TypeOrmModule`, `MongooseModule` and `JwtModule` |
| `useExisting` | A provider that is already registered, under a second name                | Not used                                                          |

**EXISTING FILE:** `useClass`, with a token that is not the class behind it.

```ts
// src/hashing/hashing.module.ts
@Module({
  providers: [{ provide: HashingProvider, useClass: BcryptProvider }],
  exports: [HashingProvider],
})
export class HashingModule {}
```

`UsersService` asks for `HashingProvider` and never names bcrypt. Changing
the algorithm means writing one new class and changing that one line.

**EXISTING FILE:** `useFactory` with `inject`, comments left out.

```ts
// src/auth/auth.module.ts
JwtModule.registerAsync({
  global: true,
  imports: [authConfigModule],
  inject: [authConfig.KEY],
  useFactory: (auth: ConfigType<typeof authConfig>) => ({
    secret: auth.secret,
  }),
});
```

Nest looks up `authConfig.KEY`, passes the result to the function as `auth`,
and uses what the function returns. The real factory returns more options.

## What a token can be

| Token                    | How a class asks for it     | Example here                                            |
| ------------------------ | --------------------------- | ------------------------------------------------------- |
| A class                  | By type alone               | `private readonly usersService: UsersService`           |
| An abstract class        | By type alone               | `private readonly hashingProvider: HashingProvider`     |
| A string or symbol       | `@Inject(TOKEN)`            | `inject: [postgresConfig.KEY]` in a factory             |
| A token a library builds | The library's own decorator | `@InjectRepository(User)`, `@InjectModel(Abiding.name)` |

An interface cannot be a token. TypeScript removes interfaces when it
compiles, so nothing is left at runtime for Nest to look up. An abstract
class survives, which is why `HashingProvider` is one.

## Modules decide who can see a provider

A provider is private to the module that lists it. Two lines make it visible
to another module:

1. The owning module lists it in `exports`.
2. The other module lists the owning module in `imports`.

`HashingModule` exports `HashingProvider`. `UsersModule` imports
`HashingModule`. So `UsersService` can ask for `HashingProvider`.

Miss either line and the app stops at startup with this error, shortened
here to one constructor argument:

```text
Nest can't resolve dependencies of the UsersService (?). Please make sure
that the argument HashingProvider at index [0] is available in the
UsersModule module.
```

The `?` marks the constructor argument Nest could not fill. The real message
lists every argument and gives the position of the missing one.

Three more things about visibility:

- **A global module needs no import.** `ConfigModule` is registered with
  `isGlobal: true` and `JwtModule` with `global: true`, so every module can
  use them.
- **A module can export a module.** `UserAbidingsModule` exports
  `MongooseModule`, so a module that imports it can inject the `Abiding`
  model.
- **Two modules must not import each other.** This app avoids that by moving
  the shared part into a third module. `UserAbidingsModule` and
  `HashingModule` both exist for that reason.

## `APP_GUARD` is a token Nest reads

**EXISTING FILE:** the global guards, comments left out.

```ts
// src/app.module.ts
providers: [
  AppService,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

Nest runs every provider registered under `APP_GUARD` as a global guard, in
the order listed. Registered this way, a guard can have dependencies of its
own, such as `JwtService`. A guard created with `new` cannot.

## Tests swap the thing behind a token

A test registers a fake under the real token with `useValue`. The class under
test asks for `UsersService` and gets the fake.
[THREE_KINDS_OF_TEST.md](THREE_KINDS_OF_TEST.md) shows the setup.

Docs: <https://docs.nestjs.com/fundamentals/custom-providers>
