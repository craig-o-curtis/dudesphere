import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import { CreateTweetDto } from "./dto/create-tweet.dto.js";
import { TweetResponseDto } from "./dto/tweet-response.dto.js";
import { UpdateTweetDto } from "./dto/update-tweet.dto.js";
import { Tweet, TweetDocument } from "./tweet.schema.js";

@Injectable()
export class TweetService {
  constructor(@InjectModel(Tweet.name) private readonly tweetModel: Model<TweetDocument>) {}

  async getTweets(userId?: number): Promise<TweetResponseDto[]> {
    const query: Record<string, any> = {};
    if (userId) {
      query.userId = userId;
    }

    const tweets = await this.tweetModel.find(query).exec();
    return tweets.map((tweet) => ({
      id: tweet._id.toString(),
      userId: tweet.userId,
      message: tweet.message,
      userName: tweet.userName || null,
      createdAt: tweet.createdAt ?? null,
      replyToId: tweet.replyToId ?? null,
    }));
  }

  async getTweetById(id: string): Promise<TweetResponseDto> {
    const tweet = await this.tweetModel.findById(id).exec();
    if (!tweet) {
      throw new Error("Tweet not found");
    }
    return {
      id: tweet._id.toString(),
      userId: tweet.userId,
      message: tweet.message,
      userName: tweet.userName || null,
      createdAt: tweet.createdAt ?? null,
      replyToId: tweet.replyToId ?? null,
    };
  }

  async createTweet(createTweetDto: CreateTweetDto): Promise<TweetResponseDto> {
    const newTweet = await this.tweetModel.create({
      userId: Number(createTweetDto.userId),
      message: createTweetDto.message,
      replyToId: createTweetDto.replyToId || null,
    });

    return {
      id: newTweet._id.toString(),
      userId: newTweet.userId,
      message: newTweet.message,
      userName: newTweet.userName || null,
      createdAt: newTweet.createdAt ?? null,
      replyToId: newTweet.replyToId ?? null,
    };
  }

  async patchTweet(id: string, updateTweetDto: UpdateTweetDto): Promise<TweetResponseDto> {
    const updatedTweet = await this.tweetModel
      .findByIdAndUpdate(
        id,
        Object.assign({}, updateTweetDto, {
          replyToId: updateTweetDto.replyToId || undefined,
        }),
        { new: true },
      )
      .exec();

    if (!updatedTweet) {
      throw new Error("Tweet not found");
    }

    return {
      id: updatedTweet._id.toString(),
      userId: updatedTweet.userId,
      message: updatedTweet.message,
      userName: updatedTweet.userName || null,
      createdAt: updatedTweet.createdAt ?? null,
      replyToId: updatedTweet.replyToId ?? null,
    };
  }

  async deleteTweet(tweetId: string): Promise<void> {
    const result = await this.tweetModel.findByIdAndDelete(tweetId).exec();
    if (!result) {
      throw new Error("Tweet not found");
    }
  }
}
