import { AuthenticationModule } from "@nestjs/authentication";
import { AuthorizationModule } from "@nestjs/authorization";
import { Module } from "@nestjs/common";
import { ConfigModule, type ConfigType } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { createObserveModule } from "@nestjs/observe";
import { minutes, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AbidingsModule } from "./abidings/abidings.module.js";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthThrottlerGuard, IP_THROTTLER } from "./auth/auth-throttler.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import authConfig from "./auth/config/auth.config.js";
import appConfig from "./config/app.config.js";
import { validateEnv } from "./config/env.validate.js";
import mongoConfig from "./config/mongo.config.js";
import observeConfig from "./config/observe.config.js";
import postgresConfig from "./config/postgres.config.js";
import throttleConfig from "./config/throttle.config.js";
import { HashtagsModule } from "./hashtags/hashtags.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { REQUEST_TIMEOUT_MS } from "./shared/interceptors/timeout.interceptor.js";
import { PaginationModule } from "./shared/pagination/pagination.module.js";
import { UsersModule } from "./users/users.module.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      // Checks every variable at startup. See src/config/env.validate.ts.
      validate: validateEnv,
      // One file per namespace. Each is injected by its KEY, as below. These are
      // the ones this module uses. A feature with config of its own loads it
      // itself, as AuthModule does with ConfigModule.forFeature.
      load: [appConfig, postgresConfig, mongoConfig, observeConfig, throttleConfig],
    }),
    // Two counts. The first is the docs': 100 requests a minute on every
    // route. AuthThrottlerGuard counts it by IP address, or by account and IP
    // together where the body names an account, and the sign-in and
    // forgot-password routes set tighter limits with @Throttle.
    //
    // The second, IP_THROTTLER, is not in the docs. It holds one IP address
    // to 100 requests a minute on the routes that name an account, however
    // many accounts it names. See AuthThrottlerGuard for why.
    //
    // The counts are kept in this process's memory, so they reset on a
    // restart and are not shared between two copies of the app.
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY],
      useFactory: (throttle: ConfigType<typeof throttleConfig>) => ({
        skipIf: () => !throttle.enabled,
        throttlers: [
          { ttl: minutes(1), limit: 100 },
          { name: IP_THROTTLER, ttl: minutes(1), limit: 100 },
        ],
      }),
    }),
    // Authentication first: its guard sets request.user, which authorization
    // reads. AuthorizationModule refuses to start in the other order.
    //
    // Registers a global guard, so every route needs a signed-in member
    // unless it is marked @Public(). JwtAuth, in AuthModule, signs a request
    // in from its bearer token. See https://docs.nestjs.com/security/authentication.
    //
    // Lifetimes are milliseconds, or strings such as "900s". A bare number of
    // seconds would be read as milliseconds, so each is passed as "<n>s".
    AuthenticationModule.forRootAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (auth: ConfigType<typeof authConfig>) => ({
        accessToken: {
          key: auth.secret,
          alg: "HS256",
          issuer: auth.issuer,
          audience: auth.audience,
          ttl: `${auth.expiresIn}s`,
        },
        refreshToken: {
          // One token, and every token of one sign-in together.
          ttl: `${auth.refreshExpiresIn}s`,
          absoluteTtl: `${auth.refreshAbsoluteExpiresIn}s`,
        },
        passwordReset: {
          // The web app's page that reads ?token= and asks for a new password.
          url: new URL("/reset-password", auth.frontendUrl).toString(),
          ttl: `${auth.passwordResetExpiresIn}s`,
        },
      }),
    }),
    // Registers a global guard that refuses a route which declares nothing.
    // Each route says who may call it: @Can(SomePolicy, "ability"),
    // @Can.Anyone() for any signed-in member, or @Public(). At startup it
    // logs every route it will refuse this way.
    // See https://docs.nestjs.com/security/authorization.
    AuthorizationModule.forRoot(),
    ObserveModule.forRootAsync({
      inject: [observeConfig.KEY],
      useFactory: (observe: ConfigType<typeof observeConfig>) => ({
        appKey: observe.appKey,
        appSecret: observe.appSecret,
        serviceId: "dude",
      }),
    }),
    TypeOrmModule.forRootAsync({
      // Reads its settings from the postgres namespace. ConfigModule is global,
      // so this import is not required, but it is listed to match the NestJS docs.
      imports: [ConfigModule],
      inject: [postgresConfig.KEY],
      // This opens the one database connection, and that connection is shared by
      // the whole app. It does not hand out repositories. A feature module still
      // lists its own entities with TypeOrmModule.forFeature([...]) before it can
      // use @InjectRepository, as UsersModule and ProfilesModule do.
      useFactory: (pg: ConfigType<typeof postgresConfig>) => ({
        type: "postgres",
        host: pg.host,
        port: pg.port,
        username: pg.username,
        password: pg.password,
        database: pg.database,
        autoLoadEntities: true,
        // Passed to the pg pool. Postgres cancels any statement that runs
        // longer than this, which frees its connection. Without it a stuck
        // query held a connection for good, even after TimeoutInterceptor
        // had answered the caller. The limit is the request's own, so no
        // statement outlives the request that asked for it. Migrations use
        // src/database/data-source.ts and are not limited.
        extra: { statement_timeout: REQUEST_TIMEOUT_MS },
        synchronize: false, // migrations are the single source of truth for the schema, so synchronize stays off in every environment
        // logging: ["query", "error"],
        // logger: "formatted-console", // ← puts each part of the query on its own line
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [mongoConfig.KEY],
      useFactory: (mongo: ConfigType<typeof mongoConfig>) => ({
        uri: mongo.uri,
        // How long a query waits for a reachable server. The driver's default
        // is 30 seconds, longer than the 10 second request limit, so a Mongo
        // outage would answer 408. At 5 seconds MongoErrorFilter still gets
        // the error and answers 503 with DATABASE_UNAVAILABLE.
        serverSelectionTimeoutMS: 5_000,
        // The driver's limit for one whole operation, read or write. It
        // tells Mongo to stop the work and throws MongoOperationTimeoutError.
        // The same number as the Postgres limit above, for the same reason.
        timeoutMS: REQUEST_TIMEOUT_MS,
      }),
    }),
    UsersModule,
    AbidingsModule,
    AuthModule,
    ProfilesModule,
    HashtagsModule,
    PaginationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Counts every request, and refuses one over the limit with a 429. The
    // root module's guards run before those of the modules it imports, so
    // this runs before the authentication guard, and a guessed token counts
    // too.
    { provide: APP_GUARD, useClass: AuthThrottlerGuard },
  ],
})
export class AppModule {}
