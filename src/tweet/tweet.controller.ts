import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

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
  public async getTweets(@Query("userId") userId?: number): Promise<TweetResponseDto[]> {
    const users = await this.usersService.getUsers();
    const tweets = await this.tweetService.getTweets(userId);
    return tweets.map(
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
  public async postTweet(@Body() createTweetDto: CreateTweetDto): Promise<TweetResponseDto> {
    const newTweet = await this.tweetService.createTweet(createTweetDto);
    const users = await this.usersService.getUsers();
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
  public async patchTweet(
    @Param("id") id: string,
    @Body() updateTweetDto: UpdateTweetDto,
  ): Promise<TweetResponseDto> {
    const updatedTweet = await this.tweetService.patchTweet(id, updateTweetDto);
    const users = await this.usersService.getUsers();
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
  async deleteTweet(@Param("id") id: string): Promise<void> {
    await this.tweetService.deleteTweet(id);
  }
}
