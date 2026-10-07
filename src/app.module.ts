import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { createObserveModule } from "@nestjs/observe";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AbidingsModule } from "./abidings/abidings.module.js";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard.js";
import { HashtagsModule } from "./hashtags/hashtags.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { RolesGuard } from "./shared/guards/roles.guard.js";
import { UsersModule } from "./users/users.module.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    ObserveModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.getOrThrow<string>("DUDE_OBSERVE_APP_KEY"),
        appSecret: config.getOrThrow<string>("DUDE_OBSERVE_APP_SECRET"),
        serviceId: "dude",
      }),
    }),
    TypeOrmModule.forRootAsync({
      // This entire forRootAsync call gets config from ConfigService
      // it also registers the TypeOrmModule globally,
      // so any feature can use @InjectRepository without importing TypeOrmModule.forFeature
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.getOrThrow("PG_HOST"),
        port: config.getOrThrow("PG_PORT"),
        username: config.getOrThrow("PG_ADMIN_USER"),
        password: config.getOrThrow("PG_ADMIN_PW"),
        database: config.getOrThrow("PG_DATABASE"),
        autoLoadEntities: true,
        synchronize: false, // migrations are the single source of truth for the schema
        // logging: ["query", "error"],
        // logger: "formatted-console", // ← puts each part of the query on its own line
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get("MONGO_URI", "mongodb://localhost:27017/dude-abidings"),
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AbidingsModule,
    AuthModule,
    ProfilesModule,
    HashtagsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Both guards run on every route in the app. Order matters and is the
    // order they are listed in: JwtAuthGuard verifies the token and puts the
    // user on the request, then RolesGuard reads that user's role.
    //
    // Because these are global, a route needs no @UseGuards. Routes an
    // anonymous caller is meant to reach carry @Public(); routes limited to a
    // role carry @Roles().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
