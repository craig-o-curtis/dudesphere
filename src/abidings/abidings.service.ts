import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, type QueryFilter } from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { HashtagsService } from "../hashtags/hashtags.service.js";
import { type Page, type PageRequest, toSkip } from "../shared/dto/paginated-response.js";
import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
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

  async getAbidings(request: PageRequest, userId?: number): Promise<Page<AbidingResponseDto>> {
    // deletedAt: null hides abidings of soft-deleted users
    const query: QueryFilter<AbidingDocument> = { deletedAt: null };
    if (userId) {
      query.userId = userId;
    }

    return this.findPage(query, request);
  }

  async getAbidingById(id: string): Promise<AbidingResponseDto> {
    const abiding = await this.abidingModel.findOne({ _id: id, deletedAt: null }).exec();
    if (!abiding) {
      throw new NotFoundException("Abiding not found");
    }
    return this.toResponseDto(abiding);
  }

  async getAbidingsByUserId(
    userId: number,
    request: PageRequest,
  ): Promise<Page<AbidingResponseDto>> {
    return this.findPage({ userId, deletedAt: null }, request);
  }

  // One tag. userId narrows to that author's abidings, same as getAbidings.
  async getAbidingsByHashtag(
    hashtag: string,
    request: PageRequest,
    userId?: number,
  ): Promise<Page<AbidingResponseDto>> {
    // Normalized here, not in the controller, so any other caller gets the
    // same rule applied — see src/shared/utils/hashtag.ts.
    const normalized = normalizeHashtag(hashtag);
    // An unusable tag can never match a stored one, so short-circuit to an
    // empty result instead of sending a query that always matches nothing
    // (or, if built wrong, everything).
    if (!normalized) {
      return { items: [], total: 0 };
    }

    const query: QueryFilter<AbidingDocument> = { deletedAt: null, hashtags: normalized };
    if (userId) {
      query.userId = userId;
    }

    return this.findPage(query, request);
  }

  // Several tags, matched with OR: an abiding needs only one of them.
  // userId narrows to that author's abidings, same as getAbidings.
  async getAbidingsByHashtags(
    hashtags: string[],
    request: PageRequest,
    userId?: number,
  ): Promise<Page<AbidingResponseDto>> {
    const normalized = [
      ...new Set(
        hashtags.map((tag) => normalizeHashtag(tag)).filter((tag): tag is string => !!tag),
      ),
    ];
    // Same reasoning as getAbidingsByHashtag: nothing usable left means the
    // query can never match, so skip it rather than send $in: [].
    if (normalized.length === 0) {
      return { items: [], total: 0 };
    }

    // $in over the multikey index ({ hashtags: 1, createdAt: -1, _id: -1 }) is
    // OR across tags, not a query per tag. Mongo reads one sorted run per tag
    // and merges them, so the page still comes off the index in order.
    //
    // That holds for up to 200 tags. Past that Mongo gives up on merging and
    // sorts every match in memory. ListAbidingsQueryDto refuses more than
    // MAX_TAGS, so a request never gets near it.
    const query: QueryFilter<AbidingDocument> = { deletedAt: null, hashtags: { $in: normalized } };
    if (userId) {
      query.userId = userId;
    }

    return this.findPage(query, request);
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

  async patchAbiding(
    id: string,
    updateAbidingDto: UpdateAbidingDto,
    caller: AuthUser,
  ): Promise<AbidingResponseDto> {
    const { message, imageUrl, replyToId } = updateAbidingDto;

    if (replyToId) {
      if (replyToId === id) {
        throw new BadRequestException("An abiding cannot reply to itself");
      }
      await this.assertReplyTargetExists(replyToId);
    }

    // Built field by field, not spread from the DTO, so a client can never
    // set `hashtags` directly, and an edit that doesn't touch `message` can't
    // wipe them to [].
    //
    // For imageUrl and replyToId a missing field and a null mean different
    // things. Missing is undefined, which Mongoose drops, so the stored value
    // stays. Null is written, which clears it.
    const update: {
      imageUrl?: string | null;
      replyToId?: string | null;
      message?: string;
      hashtags?: string[];
    } = { imageUrl, replyToId };
    if (message !== undefined) {
      update.message = message;
      update.hashtags = extractHashtags(message);
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
      throw new NotOwnerException("Not authorized to edit this abiding");
    }

    // An edit can introduce tags the registry has never seen. Tags the edit
    // removed stay registered on purpose: a tag outlives the abidings that
    // used it, so the dropdown keeps offering it.
    if (message !== undefined) {
      const displays = extractHashtagDisplays(message);
      if (displays.size > 0) {
        await this.hashtagsService.registerTags(displays);
      }
    }

    return this.toResponseDto(updatedAbiding);
  }

  async deleteAbiding(abidingId: string, caller: AuthUser): Promise<void> {
    // deletedAt: null so an abiding hidden with its deleted user is a 404 here
    // too, and comes back intact if the user is restored. ownedBy adds the
    // authorization rule to the same filter.
    // so owners get the passed userId, but admins get no user id there for can delete all
    const result = await this.abidingModel
      .findOneAndDelete({ _id: abidingId, deletedAt: null, ...this.ownedBy(caller) })
      .exec();
    if (!result) {
      await this.assertExists(abidingId);
      throw new NotOwnerException("Not authorized to delete this abiding");
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

  // One page of the abidings a filter matches, newest first, and the count of
  // all of them. Every list method ends here, so they cannot drift apart on
  // the sort or the limit.
  //
  // _id breaks ties on createdAt. Without it, abidings written in the same
  // millisecond have no fixed order and one could appear on two pages. The
  // indexes in abiding.schema.ts end with the same two keys.
  //
  // The two queries run side by side, not in a transaction. An abiding posted
  // between them can leave the total one ahead of the page, which a list of
  // posts can live with.
  //
  // The count is the costly half, and that is accepted, not solved. The page
  // comes off an index, but no index holds deletedAt, so the count reads
  // every abiding the filter matches: the whole collection when there is no
  // filter. The response shape needs a total, so it is paid on every request.
  // The query time limit in src/app.module.ts bounds it. If the collection
  // grows large, the fix is a stored count or a cursor with no total, not
  // another index: Mongo cannot count { deletedAt: null } from an index alone.
  private async findPage(
    filter: QueryFilter<AbidingDocument>,
    request: PageRequest,
  ): Promise<Page<AbidingResponseDto>> {
    const [abidings, total] = await Promise.all([
      this.abidingModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(toSkip(request))
        .limit(request.limit)
        .exec(),
      this.abidingModel.countDocuments(filter).exec(),
    ]);
    return { items: abidings.map((abiding) => this.toResponseDto(abiding)), total };
  }

  // A real instance, not an object literal. ClassSerializerInterceptor only
  // applies the DTO's @Expose and @Transform rules to an instance of the
  // class, and a list hands these straight to toPaginatedResponse.
  private toResponseDto(abiding: AbidingDocument): AbidingResponseDto {
    return new AbidingResponseDto({
      id: abiding._id.toString(),
      userId: abiding.userId,
      message: abiding.message,
      imageUrl: abiding.imageUrl ?? null,
      createdAt: abiding.createdAt ?? "",
      updatedAt: abiding.updatedAt ?? "",
      replyToId: abiding.replyToId ?? undefined,
      hashtags: abiding.hashtags ?? [],
    });
  }
}
