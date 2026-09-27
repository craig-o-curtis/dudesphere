import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { UsersModule } from "../users/users.module.js";
import { TweetController } from "./tweet.controller.js";
import { Tweet, TweetSchema } from "./tweet.schema.js";
import { TweetService } from "./tweet.service.js";

@Module({
  controllers: [TweetController],
  providers: [TweetService],
  imports: [UsersModule, MongooseModule.forFeature([{ name: Tweet.name, schema: TweetSchema }])],
})
export class TweetModule {}
