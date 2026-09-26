import { Injectable } from "@nestjs/common";
import { getUtcNow } from "@northguild/gmt";

import { CreateTweetDto } from "./dto/create-tweet.dto.js";
import { TweetResponseDto } from "./dto/tweet-response.dto.js";
import { UpdateTweetDto } from "./dto/update-tweet.dto.js";

@Injectable()
export class TweetService {
  private tweets: TweetResponseDto[] = [
    { id: 1, userId: 1, message: "tweet 1", createdAt: "2026-01-07T14:32:34Z", replyToId: null },
    { id: 2, userId: 1, message: "tweet 2", createdAt: "2026-01-07T14:32:34Z", replyToId: null },
    { id: 3, userId: 1, message: "tweet 3", createdAt: "2026-01-07T14:32:34Z", replyToId: 1 },
    { id: 4, userId: 2, message: "tweet 4", createdAt: "2026-01-07T14:32:34Z", replyToId: null },
  ];

  getTweets(userId?: number) {
    if (userId) {
      return this.tweets.filter((tweet) => tweet.userId === userId);
    }

    return this.tweets;
  }

  getTweetById(id: number): TweetResponseDto {
    const tweet = this.tweets.find((tweet) => tweet.id === id);
    if (!tweet) {
      throw new Error("Tweet not found");
    }
    return tweet;
  }

  createTweet(createTweetDto: CreateTweetDto) {
    const newTweet = {
      id: this.tweets.length + 1,
      userId: Number(createTweetDto.userId),
      message: createTweetDto.message,
      createdAt: getUtcNow(),
      replyToId: createTweetDto.replyToId ? Number(createTweetDto.replyToId) : null,
    };
    this.tweets.push(newTweet);
    return newTweet;
  }

  patchTweet(id: number, updateTweetDto: UpdateTweetDto) {
    const tweet = this.tweets.find((tweet) => tweet.id === id);
    if (!tweet) {
      throw new Error("Tweet not found");
    }

    const updatedTweet = Object.assign({}, tweet, {
      ...updateTweetDto,
      replyToId: updateTweetDto.replyToId ? Number(updateTweetDto.replyToId) : undefined,
    });
    this.tweets = this.tweets.map((t) => (t.id === id ? updatedTweet : t));
    return updatedTweet;
  }

  deleteTweet(tweetId: number) {
    const tweet = this.tweets.find((tweet) => tweet.id === tweetId);
    if (!tweet) {
      throw new Error("Tweet not found");
    }

    this.tweets = this.tweets.filter((tweet) => tweet.id !== tweetId);
  }
}
