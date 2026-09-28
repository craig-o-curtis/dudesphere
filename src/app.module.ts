import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { createObserveModule } from "@nestjs/observe";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AbidingModule } from "./abiding/abiding.module.js";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthStateModule } from "./auth/auth-state.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { UsersModule } from "./users/users.module.js";
import { ProfileModule } from './profile/profile.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot(),
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        appKey: config.getOrThrow<string>("DUDE_OBSERVE_APP_KEY"),
        appSecret: config.getOrThrow<string>("DUDE_OBSERVE_APP_SECRET"),
        serviceId: "dude",
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.getOrThrow("PG_HOST"),
        port: config.getOrThrow("PG_PORT"),
        username: config.getOrThrow("PG_ADMIN_USER"),
        password: config.getOrThrow("PG_ADMIN_PW"),
        database: config.getOrThrow("PG_DATABASE"),
        autoLoadEntities: true,
        // TODO see if need entities array with [User]
        synchronize: config.get("NODE_ENV") !== "production", // synchronize creates, updates, and deletes tables - only use in development
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get("MONGO_URI", "mongodb://localhost:27017/dude-abidings"),
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuthStateModule,
    AbidingModule,
    AuthModule,
    ProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
