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
import { AuthModule } from "./auth/auth.module.js";
import { SessionsModule } from "./auth/sessions/sessions.module.js";
import appConfig from "./config/app.config.js";
import { validateEnv } from "./config/env.validate.js";
import mongoConfig from "./config/mongo.config.js";
import observeConfig from "./config/observe.config.js";
import postgresConfig from "./config/postgres.config.js";
import throttleConfig from "./config/throttle.config.js";
import { HashtagsModule } from "./hashtags/hashtags.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { AuthThrottlerGuard } from "./shared/guards/auth-throttler.guard.js";
import { JwtAuthGuard } from "./shared/guards/jwt-auth.guard.js";
import { RolesGuard } from "./shared/guards/roles.guard.js";
import { ACCOUNT_THROTTLER } from "./shared/guards/throttle-by-account.decorator.js";
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
    // Two counts. "default" is the limit every route gets: 100 requests a
    // minute from one IP address. The second is tighter and counts by account
    // and IP address together. It runs only on a route marked
    // @ThrottleByAccount, as login and forgot-password are in
    // AuthController, and AuthThrottlerGuard skips it everywhere else. @ThrottleByAccount
    // always sets the route's own limit, so the 5 in 15 minutes here is only
    // the value ThrottlerModule needs in order to register the count.
    //
    // The counts are kept in this process's memory, so they reset on a
    // restart and are not shared between two copies of the app.
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY],
      useFactory: (throttle: ConfigType<typeof throttleConfig>) => ({
        skipIf: () => !throttle.enabled,
        throttlers: [
          { name: "default", ttl: minutes(1), limit: 100 },
          { name: ACCOUNT_THROTTLER, ttl: minutes(15), limit: 5 },
        ],
      }),
    }),
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
    // For JwtAuthGuard below, which asks SessionsService on every
    // signed-in request whether the caller's session is still going.
    SessionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // All three guards run on every route in the app. Order matters and is
    // the order they are listed in: AuthThrottlerGuard counts the request and
    // refuses it with a 429 when the caller is over the limit, JwtAuthGuard
    // verifies the token and puts the user on the request, then RolesGuard
    // reads that user's role. The limiter goes first so that a guessed token
    // is counted too.
    //
    // Because these are global, a route needs no @UseGuards. A route an
    // anonymous caller is meant to reach carries @Public(). Every other route
    // carries @Auth(), with the roles that may call it when it is limited to
    // some. src/shared/guards/route-access.spec.ts requires one of the two.
    //
    // The three guards and their decorators live in src/shared/guards. Its
    // README follows one request through all three.
    { provide: APP_GUARD, useClass: AuthThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
