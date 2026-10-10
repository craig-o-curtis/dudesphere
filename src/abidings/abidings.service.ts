import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isAfterUtc } from "@northguild/gmt";
import { Model, type QueryFilter } from "mongoose";

import type { AuthUser } from "../auth/auth-user.js";
import { HashtagsService } from "../hashtags/hashtags.service.js";
import type { Page, PageRequest } from "../shared/dto/paginated-response.js";
import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
import {
  extractHashtagDisplays,
  extractHashtags,
  normalizeHashtag,
} from "../shared/utils/hashtag.js";
import { findMongoPage } from "../shared/utils/mongo-page.js";
import { UserRole } from "../users/user.entity.js";
import { UsersService } from "../users/users.service.js";
import { Abiding, AbidingDocument } from "./abiding.schema.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";
import { CreateAbidingDto } from "./dto/create-abiding.dto.js";
import { UpdateAbidingDto } from "./dto/update-abiding.dto.js";

/** The filters every list of abidings takes. Each one is optional. */
export interface AbidingFilters {
  userId?: number;
  // UTC instants. startDate is included in the range and endDate is not.
  startDate?: string;
  endDate?: string;
  // Matched with OR: an abiding needs only one of them. Each is accepted
  // with or without a leading # and in any case. Leave it out, or pass an
  // empty list, for no tag filter.
  hashtags?: string[];
}

@Injectable()
export class AbidingsService {
  constructor(
    @InjectModel(Abiding.name) private readonly abidingModel: Model<AbidingDocument>,
    private readonly hashtagsService: HashtagsService,
    private readonly usersService: UsersService,
  ) {}

  // The one list GET /abidings needs. It decides which query to run, so the
  // controller only has to pass the filters on.
  async getAbidings(
    pageRequest: PageRequest,
    filters: AbidingFilters = {},
  ): Promise<Page<AbidingResponseDto>> {
    // First, so a bad date range is a 400 whatever the tags are.
    const filter = this.sharedFilter(filters);
    if (!filters.hashtags || filters.hashtags.length === 0) {
      return this.findPage(filter, pageRequest);
    }

    // Normalized here, not in the controller, so any other caller gets the
    // same rule applied — see src/shared/utils/hashtag.ts. The Set drops a
    // tag that was sent twice.
    const tags = [
      ...new Set(
        filters.hashtags.map((tag) => normalizeHashtag(tag)).filter((tag): tag is string => !!tag),
      ),
    ];
    // Tags were asked for and none is usable, so nothing can match. An empty
    // page, not a query: $in: [] matches nothing anyway, and a query built
    // without the tag filter would return everything.
    if (tags.length === 0) {
      return { items: [], total: 0 };
    }

    // $in over the multikey index ({ hashtags: 1, createdAt: -1, _id: -1 }) is
    // OR across tags, not a query per tag. Mongo reads one sorted run per tag
    // and merges them, so the page still comes off the index in order.
    //
    // That holds for up to 200 tags. Past that Mongo gives up on merging and
    // sorts every match in memory. GetAbidingsDto refuses more than
    // MAX_TAGS, so a request never gets near it.
    return this.findPage(
      { ...filter, hashtags: tags.length === 1 ? tags[0] : { $in: tags } },
      pageRequest,
    );
  }

  async getAbidingById(id: string): Promise<AbidingResponseDto> {
    const abiding = await this.abidingModel.findOne({ _id: id, deletedAt: null }).exec();
    if (!abiding) {
      throw new NotFoundException("Abiding not found");
    }
    return this.withUsername(this.toResponseDto(abiding));
  }

  async getAbidingsByUserId(
    userId: number,
    pageRequest: PageRequest,
  ): Promise<Page<AbidingResponseDto>> {
    return this.findPage({ userId, deletedAt: null }, pageRequest);
  }

  // The author is the caller, taken from the verified token. It was previously
  // read from the request body, which let anyone post as anyone.
  async createAbiding(
    createAbidingDto: CreateAbidingDto,
    caller: AuthUser,
  ): Promise<AbidingResponseDto> {
    // Looked up before the write, not after. A token proves who logged in, not
    // that the account still exists: it stays valid until it expires, even
    // after the user is deleted. getMyUser throws a 404 for a user who is
    // deleted or was never there, so no abiding is written for an author
    // nobody can find.
    const author = await this.usersService.getMyUser(caller.userId);

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

    // The author was read above, so the response can carry the username and
    // the controller has nothing to add.
    const response = this.toResponseDto(newAbiding);
    response.username = author.username;
    return response;
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

    return this.withUsername(this.toResponseDto(updatedAbiding));
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
  // the sort.
  //
  // _id breaks ties on createdAt. Without it, abidings written in the same
  // millisecond have no fixed order and one could appear on two pages. The
  // indexes in abiding.schema.ts end with the same two keys.
  //
  // findMongoPage runs the page and the count. Its comment says what the
  // count costs. This method adds the three things only abidings know: the
  // sort, the response class, and each author's username.
  private async findPage(
    filter: QueryFilter<AbidingDocument>,
    pageRequest: PageRequest,
  ): Promise<Page<AbidingResponseDto>> {
    const { items, total } = await findMongoPage(
      this.abidingModel,
      filter,
      { createdAt: -1, _id: -1 },
      pageRequest,
    );
    const abidings = items.map((abiding) => this.toResponseDto(abiding));
    return { items: await this.withUsernames(abidings), total };
  }

  // Puts each author's current username on the abidings it is given. The
  // names live in Postgres and the abidings in Mongo, so this is the join:
  // one query for the distinct authors, however many abidings they wrote.
  //
  // getUsersByIds includes soft-deleted users, so their name still shows.
  // "Unknown" covers an author whose row is gone altogether.
  private async withUsernames(abidings: AbidingResponseDto[]): Promise<AbidingResponseDto[]> {
    const authorIds = [...new Set(abidings.map((abiding) => abiding.userId))];
    const users = await this.usersService.getUsersByIds(authorIds);
    const usernames = new Map(users.map((user) => [user.id, user.username]));
    for (const abiding of abidings) {
      abiding.username = usernames.get(abiding.userId) || "Unknown";
    }
    return abidings;
  }

  // The same, for one abiding.
  private async withUsername(abiding: AbidingResponseDto): Promise<AbidingResponseDto> {
    await this.withUsernames([abiding]);
    return abiding;
  }

  // The one place an abiding becomes a response. A real instance, not an
  // object literal: ClassSerializerInterceptor only applies the DTO's @Expose
  // and @Transform rules to an instance of the class, and the controller
  // returns these as they are.
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

  // The part of getAbidings' filter that has nothing to do with tags: live
  // abidings only, one author if asked for, and a date range if asked for.
  private sharedFilter({
    userId,
    startDate,
    endDate,
  }: AbidingFilters): QueryFilter<AbidingDocument> {
    if (startDate && endDate && isAfterUtc(startDate, endDate)) {
      throw new BadRequestException("startDate must not be after endDate");
    }

    // deletedAt: null hides abidings of soft-deleted users
    const filter: QueryFilter<AbidingDocument> = { deletedAt: null };
    if (userId) {
      filter.userId = userId;
    }
    // startDate is included and endDate is not, so two ranges placed end to
    // start never share an abiding. The values stay strings: Mongoose casts
    // them to the date type createdAt is stored as.
    if (startDate || endDate) {
      filter.createdAt = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lt: endDate } : {}),
      };
    }
    return filter;
  }
}
