import { Module } from "@nestjs/common";
import { createObserveModule } from "@nestjs/observe";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UsersModule } from "./users/users.module.js";
import { TweetModule } from "./tweet/tweet.module.js";

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
    UsersModule,
    TweetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
