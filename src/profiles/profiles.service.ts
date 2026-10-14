import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, IsNull, Not, QueryFailedError, Repository } from "typeorm";

import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import { UNIQUE_VIOLATION } from "../shared/filters/pg-error.filter.js";
import type { Page, PageRequest } from "../shared/pagination/paginated.interface.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { type User, UserRole } from "../users/user.entity.js";
import { CreateProfileDto } from "./dto/create-profile-dto.js";
import { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { UpdateProfileDto } from "./dto/update-profile-dto.js";
import { Profile } from "./profile.entity.js";

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getProfiles(pageRequest: PageRequest): Promise<Page<ProfileResponseDto>> {
    const { items, total } = await this.paginationProvider.paginatePgQuery(
      pageRequest,
      this.profileRepository,
      {
        // A fixed order. Without one Postgres may return rows in any order, so
        // two pages of the same list could repeat a profile or skip one.
        order: { id: "ASC" },
      },
    );
    return { items: items.map((profile) => ProfileResponseDto.fromEntity(profile)), total };
  }

  async getProfileById(id: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Profile #${id} not found`);
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  async getProfileByUserId(userId: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(`Profile for user #${userId} not found`);
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  // The display name of each of these users, keyed by user id. AbidingsService
  // calls it to name the authors of a page: one query, however many abidings
  // they wrote. A user with no profile is simply not in the map.
  //
  // withDeleted: callers use this to name the author of existing content. A
  // soft-deleted member still wrote what they wrote.
  async getDisplayNamesByUserIds(userIds: number[]): Promise<Map<number, string>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const profiles = await this.profileRepository.find({
      where: { userId: In(userIds) },
      select: { userId: true, displayName: true },
      withDeleted: true,
    });
    return new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  }

  // Called by UsersService inside its transaction.
  // It uses the `manager` it is given, NOT this.profileRepository,
  // so the insert is part of the same transaction as the user insert.
  async createProfileForUser(
    manager: EntityManager,
    userId: number,
    dto: CreateProfileDto,
  ): Promise<Profile> {
    const profile = manager.create(Profile, {
      userId,
      displayName: dto.displayName,
      bio: dto.bio ?? null,
      profileImageUrl: dto.profileImageUrl ?? null,
      isDude: dto.isDude ?? false,
      ordainedDate: dto.ordainedDate ?? null,
    });
    return manager.save(Profile, profile);
  }

  // Called by UsersService inside its transaction, before it writes anything,
  // so a taken name is a 409 that says which field to change.
  //
  // Postgres does the comparing. The column is citext, so "the dude" finds
  // "The Dude". Lower-casing here in JavaScript would not match what citext
  // treats as equal.
  //
  // withDeleted: the unique constraint still covers soft-deleted profiles, so
  // the check has to see them too. Without it a deleted member's name passes
  // here and then fails on the constraint.
  async assertDisplayNameFree(manager: EntityManager, displayName: string): Promise<void> {
    const taken = await manager.exists(Profile, { where: { displayName }, withDeleted: true });
    if (taken) {
      throw new ValueTakenException("displayName");
    }
  }

  // Called by UsersService inside its transaction, like createProfileForUser
  async softDeleteForUser(manager: EntityManager, userId: number): Promise<void> {
    // IsNull() here is to ensure we only soft-delete the profile if it hasn't already been soft-deleted.
    // it is not `null`, but rather the `deletedAt` column is `null` (meaning it is not deleted yet).
    await manager.softDelete(Profile, { userId, deletedAt: IsNull() });
  }

  // Called by UsersService inside its transaction, the reverse of softDeleteForUser.
  async restoreForUser(manager: EntityManager, userId: number): Promise<void> {
    // Not(IsNull()) so only a soft-deleted profile is touched.
    await manager.restore(Profile, { userId, deletedAt: Not(IsNull()) });
  }

  // `caller` is who is asking, so one rule covers both routes that reach here:
  // an admin edits any profile, and everyone else edits only their own. The
  // ownership condition goes in the update criteria rather than a separate
  // read, so the check and the write are one statement with no window between
  // them.
  async updateProfile(
    id: number,
    updateProfileDto: UpdateProfileDto,
    caller: User,
  ): Promise<ProfileResponseDto> {
    // TypeORM's update() throws UpdateValuesMissingError on an empty set, and
    // that is not a QueryFailedError, so PgErrorFilter lets it through as
    // a 500. Every field on UpdateProfileDto is optional, so an empty body
    // reaches here through PATCH /profiles/me and PATCH /profiles/:id alike.
    if (Object.keys(updateProfileDto).length === 0) {
      throw new BadRequestException("No profile fields to update");
    }
    // deletedAt: IsNull() because update() does not apply the soft-delete
    // filter that find() does. Without it a deleted profile gets edited and
    // the caller still gets a 404 from getProfileById below.
    //
    // No lookup for a taken display name before the write, unlike sign up. A
    // lookup would run before the ownership rule in the criteria, so a
    // stranger would be told "taken" where they should be told 403, and a
    // missing profile would be a 409. The update is tried, and the unique
    // constraint answers.
    const result = await this.profileRepository
      .update({ id, deletedAt: IsNull(), ...this.ownedBy(caller) }, updateProfileDto)
      .catch((error: unknown) => {
        // displayName is the only unique column this DTO can write, so a
        // unique violation here can only mean that name is in use.
        if (isUniqueViolation(error)) {
          throw new ValueTakenException("displayName", { cause: error });
        }
        throw error;
      });
    if (result.affected === 0) {
      // Nothing matched, which means the profile is missing or it is someone
      // else's. One extra read, on the failure path only, to tell those apart:
      // getProfileById throws 404 when it is gone, so reaching the line below
      // means it exists and the caller does not own it.
      await this.getProfileById(id);
      throw new NotOwnerException("Not authorized to edit this profile");
    }
    return this.getProfileById(id);
  }

  // An admin is unrestricted, so the criteria gain nothing. Everyone else is
  // pinned to their own userId.
  private ownedBy(caller: User): { userId?: number } {
    return caller.role === UserRole.ADMIN ? {} : { userId: caller.id };
  }
}

/** True for the error TypeORM throws when Postgres refuses a duplicate value. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { code?: string }).code === UNIQUE_VIOLATION
  );
}
