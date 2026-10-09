import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { HashtagsService } from "../hashtags/hashtags.service.js";
import { ErrorCode } from "../shared/error-codes.js";
import {
  extractHashtagDisplays,
  extractHashtags,
  normalizeHashtag,
} from "../shared/utils/hashtag.js";
import { UserRole } from "../users/user.entity.js";
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

  // The author is the caller, taken from the verified token. It was previously
  // read from the request body, which let anyone post as anyone.
  async createAbiding(
    createAbidingDto: CreateAbidingDto,
    caller: AuthUser,
  ): Promise<AbidingResponseDto> {
    if (createAbidingDto.replyToId) {
      await this.assertReplyTargetExists(createAbidingDto.replyToId);
    }

    const newAbiding = await this.abidingModel.create({
      userId: caller.userId,
      message: createAbidingDto.message,
      // The DTO has always accepted imageUrl. It was never passed on here, so
      // a post with an image was stored without one.
      imageUrl: createAbidingDto.imageUrl ?? null,
      replyToId: createAbidingDto.replyToId ?? null,
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

  // TODO refactor to be more elegant
  async patchAbiding(
    id: string,
    updateAbidingDto: UpdateAbidingDto,
    caller: AuthUser,
  ): Promise<AbidingResponseDto> {
    // Built explicitly, not spread from the DTO, so a client can never set
    // `hashtags` directly and an edit that doesn't touch `message` can't
    // accidentally wipe it to [].
    //
    // For imageUrl and replyToId a missing field and a null mean different
    // things. Missing is undefined, which Mongoose drops, so the stored value
    // stays. Null is written, which clears it.
    const update: Record<string, any> = {
      imageUrl: updateAbidingDto.imageUrl,
      replyToId: updateAbidingDto.replyToId,
    };
    if (updateAbidingDto.replyToId) {
      if (updateAbidingDto.replyToId === id) {
        throw new BadRequestException("An abiding cannot reply to itself");
      }
      await this.assertReplyTargetExists(updateAbidingDto.replyToId);
    }
    if (typeof updateAbidingDto.message === "string" && updateAbidingDto.message.length > 0) {
      update.message = updateAbidingDto.message;
      update.hashtags = extractHashtags(updateAbidingDto.message);
    }

    // returnDocument: "after" returns the updated document, not the original.
    // It replaces the older { new: true }, which Mongoose has deprecated.
    // ownedBy puts the authorization rule in the filter, so the check and the
    // write are one operation with no window between them.
    //
    // runValidators: true because Mongoose skips the schema's rules on an
    // update unless asked. Without it an edit stored a message that create
    // would have refused.
    const updatedAbiding = await this.abidingModel
      .findOneAndUpdate({ _id: id, deletedAt: null, ...this.ownedBy(caller) }, update, {
        returnDocument: "after",
        runValidators: true,
      })
      .exec();

    if (!updatedAbiding) {
      await this.assertExists(id);
      throw new ForbiddenException("Not authorized to edit this abiding", {
        errorCode: ErrorCode.NOT_OWNER,
      });
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

  async deleteAbiding(abidingId: string, caller: AuthUser): Promise<void> {
    // deletedAt: null so an abiding hidden with its deleted user is a 404 here
    // too, and comes back intact if the user is restored. ownedBy adds the
    // authorization rule to the same filter.
    const result = await this.abidingModel
      .findOneAndDelete({ _id: abidingId, deletedAt: null, ...this.ownedBy(caller) })
      .exec();
    if (!result) {
      await this.assertExists(abidingId);
      throw new ForbiddenException("Not authorized to delete this abiding", {
        errorCode: ErrorCode.NOT_OWNER,
      });
    }
  }

  // --- Authorization helpers ---

  // An admin may touch anyone's abiding, so the filter gains nothing. Everyone
  // else is pinned to their own userId.
  private ownedBy(caller: AuthUser): { userId?: number } {
    return caller.role === UserRole.ADMIN ? {} : { userId: caller.userId };
  }

  // Called only when an ownership-scoped write matched nothing, to tell a
  // missing abiding from someone else's. Throws 404 when it is gone; returning
  // normally means it exists and the caller does not own it.
  //
  // A missing abiding is a 404 even for a non-owner, deliberately: answering
  // 403 would tell a caller which ids exist.
  private async assertExists(id: string): Promise<void> {
    const exists = await this.abidingModel.exists({ _id: id, deletedAt: null }).exec();
    if (!exists) {
      throw new NotFoundException("Abiding not found");
    }
  }

  // A reply has to point at an abiding a reader can open. Mongo has no
  // foreign keys, so nothing else would stop a reply to an id that was never
  // there, or to an abiding hidden with its deleted author.
  private async assertReplyTargetExists(replyToId: string): Promise<void> {
    const exists = await this.abidingModel.exists({ _id: replyToId, deletedAt: null }).exec();
    if (!exists) {
      throw new NotFoundException("The abiding being replied to was not found");
    }
  }

  // --- Private helpers ---

  private toResponseDto(abiding: AbidingDocument): AbidingResponseDto {
    return {
      id: abiding._id.toString(),
      userId: abiding.userId,
      message: abiding.message,
      imageUrl: abiding.imageUrl ?? null,
      username: abiding.username || undefined,
      createdAt: abiding.createdAt ?? "",
      updatedAt: abiding.updatedAt ?? "",
      replyToId: abiding.replyToId ?? undefined,
      hashtags: abiding.hashtags ?? [],
    };
  }
}
