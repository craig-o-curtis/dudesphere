import { Module } from "@nestjs/common";

import { TweetController } from "./tweet.controller.js";
import { TweetService } from "./tweet.service.js";

@Module({
  controllers: [TweetController],
  providers: [TweetService],
})
export class TweetModule {}
