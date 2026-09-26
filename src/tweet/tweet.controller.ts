import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { UsersService } from "../users/users.service.js";
import { CreateTweetDto } from "./dto/create-tweet.dto.js";
import { TweetResponseDto } from "./dto/tweet-response.dto.js";
import { UpdateTweetDto } from "./dto/update-tweet.dto.js";
import { TweetService } from "./tweet.service.js";

@Controller("tweet")
export class TweetController {
  constructor(
    private readonly tweetService: TweetService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  public getTweets(
    @Query("userId", new ParseIntPipe({ optional: true })) userId?: number,
  ): TweetResponseDto[] {
    const users = this.usersService.getUsers() as Array<{ id: number; name: string }>;
    return this.tweetService.getTweets(userId).map(
      (t) =>
        new TweetResponseDto({
          id: t.id,
          userId: t.userId,
          message: t.message,
          userName: users.find((u) => u.id === t.userId)?.name || "Unknown",
          createdAt: t.createdAt || null,
          replyToId: t.replyToId ?? null,
        }),
    );
  }

  @Post()
  public postTweet(@Body() createTweetDto: CreateTweetDto): TweetResponseDto {
    const newTweet = this.tweetService.createTweet(createTweetDto);
    const users = this.usersService.getUsers() as Array<{ id: number; name: string }>;
    return new TweetResponseDto({
      id: newTweet.id,
      userId: newTweet.userId,
      message: newTweet.message,
      createdAt: newTweet.createdAt,
      replyToId: newTweet.replyToId ?? null,
      userName: users.find((u) => u.id === newTweet.userId)?.name || "Unknown",
    });
  }

  @Patch(":id")
  public patchTweet(
    @Param("id") id: string,
    @Body() updateTweetDto: UpdateTweetDto,
  ): TweetResponseDto {
    const tweetId = Number(id);
    const updatedTweet = this.tweetService.patchTweet(tweetId, updateTweetDto);
    const users = this.usersService.getUsers() as Array<{ id: number; name: string }>;
    return new TweetResponseDto({
      id: updatedTweet.id,
      userId: updatedTweet.userId,
      message: updatedTweet.message,
      createdAt: updatedTweet.createdAt,
      replyToId: updatedTweet.replyToId ?? null,
      userName: users.find((u) => u.id === updatedTweet.userId)?.name || "Unknown",
    });
  }

  @Delete(":id")
  deleteTweet(@Param("id", ParseIntPipe) id: number): void {
    this.tweetService.deleteTweet(id);
  }
}
