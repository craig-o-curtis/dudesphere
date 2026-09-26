import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { TweetController } from "./tweet.controller.js";
import { TweetService } from "./tweet.service.js";

@Module({
  controllers: [TweetController],
  providers: [TweetService],
  imports: [UsersModule],
})
export class TweetModule {}
