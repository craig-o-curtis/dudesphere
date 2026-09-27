import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { createObserveModule } from "@nestjs/observe";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthStateModule } from "./auth/auth-state.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { TweetModule } from "./tweet/tweet.module.js";
import { UsersModule } from "./users/users.module.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot(),
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        appKey: config.getOrThrow<string>("DUDE_OBSERVE_APP_KEY"),
        appSecret: config.getOrThrow<string>("DUDE_OBSERVE_APP_SECRET"),
        serviceId: "dude",
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("PG_HOST", "localhost"),
        port: config.get("PG_PORT", 5432),
        username: config.get("PG_ADMIN_USER", "dude"),
        password: config.get("PG_ADMIN_PW", "dude_password_123"),
        database: config.get("PG_DATABASE", "dude"),
        autoLoadEntities: true,
        synchronize: true, // WARNING: only for development! Use migrations in production.
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get("MONGO_URI", "mongodb://localhost:27017/dude-tweets"),
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuthStateModule,
    TweetModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
