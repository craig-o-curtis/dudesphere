import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import { HashtagsService } from "../hashtags/hashtags.service.js";
import {
  extractHashtagDisplays,
  extractHashtags,
  normalizeHashtag,
} from "../shared/utils/hashtag.js";
import { Abiding, AbidingDocument } from "./abiding.schema.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";
import { UpdateAbidingDto } from "./dto/update-abiding.dto.js";

@Injectable()
export class AbidingsService {
  constructor(
    @InjectModel(Abiding.name) private readonly abidingModel: Model<AbidingDocument>,
    private readonly hashtagsService: HashtagsService,
  ) {}

  async getAbidings(userId?: number): Promise<AbidingResponseDto[]> {
    // deletedAt: null hides abidings of soft-deleted users
    const query: Record<string, any> = { deletedAt: null };
    if (userId) {
      query.userId = userId;
    }

    const abidings = await this.abidingModel.find(query).exec();
    return abidings.map((abiding) => this.toResponseDto(abiding));
  }

  async getAbidingById(id: string): Promise<AbidingResponseDto> {
    const abiding = await this.abidingModel.findOne({ _id: id, deletedAt: null }).exec();
    if (!abiding) {
      throw new NotFoundException("Abiding not found");
    }
    return this.toResponseDto(abiding);
  }

  async getAbidingsByUserId(userId: number): Promise<AbidingResponseDto[]> {
    const abidings = await this.abidingModel.find({ userId, deletedAt: null }).exec();
    return abidings.map((abiding) => this.toResponseDto(abiding));
  }

  // One tag. userId narrows to that author's abidings, same as getAbidings.
  async getAbidingsByHashtag(hashtag: string, userId?: number): Promise<AbidingResponseDto[]> {
    // Normalized here, not in the controller, so any other caller gets the
    // same rule applied — see src/shared/utils/hashtag.ts.
    const normalized = normalizeHashtag(hashtag);
    // An unusable tag can never match a stored one, so short-circuit to an
    // empty result instead of sending a query that always matches nothing
    // (or, if built wrong, everything).
    if (!normalized) {
      return [];
    }

    const query: Record<string, any> = { deletedAt: null, hashtags: normalized };
    if (userId) {
      query.userId = userId;
    }

    const abidings = await this.abidingModel.find(query).exec();
    return abidings.map((abiding) => this.toResponseDto(abiding));
  }

  // Several tags, matched with OR: an abiding needs only one of them.
  // userId narrows to that author's abidings, same as getAbidings.
  async getAbidingsByHashtags(hashtags: string[], userId?: number): Promise<AbidingResponseDto[]> {
    const normalized = [
      ...new Set(
        hashtags.map((tag) => normalizeHashtag(tag)).filter((tag): tag is string => !!tag),
      ),
    ];
    // Same reasoning as getAbidingsByHashtag: nothing usable left means the
    // query can never match, so skip it rather than send $in: [].
    if (normalized.length === 0) {
      return [];
    }

    // $in over a multikey index ({ hashtags: 1, createdAt: -1 }) is still a
    // single index scan — OR across tags, not a query per tag.
    const query: Record<string, any> = { deletedAt: null, hashtags: { $in: normalized } };
    if (userId) {
      query.userId = userId;
    }

    const abidings = await this.abidingModel.find(query).exec();
    return abidings.map((abiding) => this.toResponseDto(abiding));
  }

  async createAbiding(createAbidingDto: CreateAbidingDto): Promise<AbidingResponseDto> {
    const newAbiding = await this.abidingModel.create({
      userId: Number(createAbidingDto.userId),
      message: createAbidingDto.message,
      replyToId: createAbidingDto.replyToId || null,
      // Derived from the message, never from client input — there is no
      // `hashtags` field on CreateAbidingDto.
      hashtags: extractHashtags(createAbidingDto.message),
    });

    // After the abiding is written, so a registry failure can never cost the
    // user their post. registerTags swallows its own errors for the same
    // reason — see its comment.
    const hashtags = extractHashtagDisplays(createAbidingDto.message);
    if (hashtags.size > 0) {
      await this.hashtagsService.registerTags(hashtags);
    }

    return this.toResponseDto(newAbiding);
  }

  async patchAbiding(id: string, updateAbidingDto: UpdateAbidingDto): Promise<AbidingResponseDto> {
    // Built explicitly, not spread from the DTO, so a client can never set
    // `hashtags` directly and an edit that doesn't touch `message` can't
    // accidentally wipe it to [].
    const update: Record<string, any> = {
      imageUrl: updateAbidingDto.imageUrl,
      replyToId: updateAbidingDto.replyToId || undefined,
    };
    if (updateAbidingDto.message !== undefined) {
      update.message = updateAbidingDto.message;
      update.hashtags = extractHashtags(updateAbidingDto.message);
    }

    const updatedAbiding = await this.abidingModel
      .findOneAndUpdate({ _id: id, deletedAt: null }, update, { new: true })
      .exec();

    if (!updatedAbiding) {
      throw new NotFoundException("Abiding not found");
    }

    // An edit can introduce tags the registry has never seen. Tags the edit
    // removed stay registered on purpose: a tag outlives the abidings that
    // used it, so the dropdown keeps offering it.
    const hashtags = updateAbidingDto.message
      ? extractHashtagDisplays(updateAbidingDto.message)
      : new Map();
    if (updateAbidingDto.message !== undefined && hashtags.size > 0) {
      await this.hashtagsService.registerTags(hashtags);
    }

    return this.toResponseDto(updatedAbiding);
  }

  async deleteAbiding(abidingId: string): Promise<void> {
    // deletedAt: null so an abiding hidden with its deleted user is a 404 here
    // too, and comes back intact if the user is restored.
    const result = await this.abidingModel
      .findOneAndDelete({ _id: abidingId, deletedAt: null })
      .exec();
    if (!result) {
      throw new NotFoundException("Abiding not found");
    }
  }

  // --- Private helpers ---

  private toResponseDto(abiding: AbidingDocument): AbidingResponseDto {
    return {
      id: abiding._id.toString(),
      userId: abiding.userId,
      message: abiding.message,
      username: abiding.username || undefined,
      createdAt: abiding.createdAt ?? "",
      updatedAt: abiding.updatedAt ?? "",
      replyToId: abiding.replyToId ?? undefined,
      hashtags: abiding.hashtags ?? [],
    };
  }
}
