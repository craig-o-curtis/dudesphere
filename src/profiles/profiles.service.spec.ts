import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EntityManager, In, IsNull, Not, QueryFailedError } from "typeorm";

import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import type { AuthUser } from "../shared/guards/auth-user.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { UserRole } from "../users/user.entity.js";
import { Profile } from "./profile.entity.js";
import { ProfilesService } from "./profiles.service.js";

describe("ProfilesService", () => {
  let service: ProfilesService;
  let module: TestingModule;

  // A fake repository: only the methods ProfilesService actually calls.
  const profileRepository = {
    find: vi.fn(),
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockProfile = {
    id: 1,
    userId: 42,
    displayName: "The Dude",
    bio: "Hello world",
    profileImageUrl: "https://example.com/avatar.jpg",
    isDude: true,
    ordainedDate: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T23:59:59.999Z",
  };

  // mockProfile.userId is 42, so `owner` owns it and `other` does not.
  const owner: AuthUser = { userId: 42, username: "dude", role: UserRole.USER };
  const other: AuthUser = { userId: 7, username: "donny", role: UserRole.USER };
  const admin: AuthUser = { userId: 9, username: "maude", role: UserRole.ADMIN };

  beforeEach(async () => {
    vi.resetAllMocks();

    module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
        // The real one. It has no dependencies, and getProfiles is tested through it.
        PaginationProvider,
      ],
    }).compile();

    service = module.get(ProfilesService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe("getProfiles", () => {
    it("returns the first page with the count of every profile", async () => {
      profileRepository.findAndCount.mockResolvedValue([[mockProfile], 23]);

      const result = await service.getProfiles({ limit: 10, page: 1 });

      expect(profileRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: "ASC" },
        skip: 0,
        take: 10,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(1);
      expect(result.items[0].userId).toBe(42);
      expect(result.total).toBe(23);
    });

    it("returns profiles with custom limit and page", async () => {
      profileRepository.findAndCount.mockResolvedValue([[mockProfile], 23]);

      await service.getProfiles({ limit: 5, page: 2 });

      expect(profileRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: "ASC" },
        skip: 5,
        take: 5,
      });
    });

    it("returns no items and a total of 0 when no profiles exist", async () => {
      profileRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getProfiles({ limit: 10, page: 1 });

      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe("getProfileById", () => {
    it("returns the profile for a valid id", async () => {
      profileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.getProfileById(1);

      expect(profileRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result.id).toBe(1);
      expect(result.userId).toBe(42);
      expect(result.displayName).toBe("The Dude");
    });

    it("throws NotFoundException when profile does not exist", async () => {
      profileRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfileById(999)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getProfileById(999)).rejects.toThrow("Profile #999 not found");
    });
  });

  describe("getProfileByUserId", () => {
    it("returns the profile for a user", async () => {
      profileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.getProfileByUserId(42);

      expect(profileRepository.findOne).toHaveBeenCalledWith({ where: { userId: 42 } });
      expect(result.id).toBe(1);
      expect(result.userId).toBe(42);
    });

    it("throws NotFoundException when the user has no profile", async () => {
      profileRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfileByUserId(999)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getProfileByUserId(999)).rejects.toThrow(
        "Profile for user #999 not found",
      );
    });
  });

  // AbidingsService names the authors of a page through this.
  describe("getDisplayNamesByUserIds", () => {
    it("returns each user's display name, keyed by user id", async () => {
      profileRepository.find.mockResolvedValue([
        { userId: 1, displayName: "Admin Dude" },
        { userId: 25, displayName: "Walter" },
      ]);

      const names = await service.getDisplayNamesByUserIds([1, 25]);

      expect([...names]).toEqual([
        [1, "Admin Dude"],
        [25, "Walter"],
      ]);
    });

    // One query for the whole page. Only the two columns it needs, so
    // nothing else about a profile travels with an abiding. withDeleted: a
    // soft-deleted author still gets their name shown.
    it("loads only those users, only the two columns, deleted profiles included", async () => {
      profileRepository.find.mockResolvedValue([]);

      await service.getDisplayNamesByUserIds([1, 25]);

      expect(profileRepository.find).toHaveBeenCalledTimes(1);
      expect(profileRepository.find).toHaveBeenCalledWith({
        where: { userId: In([1, 25]) },
        select: { userId: true, displayName: true },
        withDeleted: true,
      });
    });

    it("leaves a user with no profile out of the map", async () => {
      profileRepository.find.mockResolvedValue([{ userId: 1, displayName: "Admin Dude" }]);

      const names = await service.getDisplayNamesByUserIds([1, 99]);

      expect(names.has(99)).toBe(false);
    });

    it("skips the query when there are no ids", async () => {
      const names = await service.getDisplayNamesByUserIds([]);

      expect(names.size).toBe(0);
      expect(profileRepository.find).not.toHaveBeenCalled();
    });
  });

  describe("createProfileForUser", () => {
    it("creates a profile from a display name alone, with defaults for the rest", async () => {
      const create = vi.fn().mockReturnValue(mockProfile);
      const save = vi.fn().mockResolvedValue(mockProfile);
      const mockManager = { create, save } as unknown as EntityManager;

      const result = await service.createProfileForUser(mockManager, 42, {
        displayName: "The Dude",
      });

      expect(create).toHaveBeenCalledWith(Profile, {
        userId: 42,
        displayName: "The Dude",
        bio: null,
        profileImageUrl: null,
        isDude: false,
        ordainedDate: null,
      });
      expect(save).toHaveBeenCalledWith(Profile, mockProfile);
      expect(result.id).toBe(1);
    });

    it("creates a profile with full DTO data", async () => {
      const create = vi.fn().mockReturnValue(mockProfile);
      const save = vi.fn().mockResolvedValue(mockProfile);
      const mockManager = { create, save } as unknown as EntityManager;

      const dto = {
        displayName: "Maude",
        bio: "A great bio",
        profileImageUrl: "https://example.com/jane.jpg",
        isDude: true,
        ordainedDate: "2026-06-15T12:00:00.000Z",
      };

      const result = await service.createProfileForUser(mockManager, 42, dto);

      expect(create).toHaveBeenCalledWith(Profile, {
        userId: 42,
        displayName: "Maude",
        bio: "A great bio",
        profileImageUrl: "https://example.com/jane.jpg",
        isDude: true,
        ordainedDate: "2026-06-15T12:00:00.000Z",
      });
      expect(result.id).toBe(1);
    });

    it("creates a profile with partial DTO data", async () => {
      const create = vi.fn().mockReturnValue(mockProfile);
      const save = vi.fn().mockResolvedValue(mockProfile);
      const mockManager = { create, save } as unknown as EntityManager;

      const dto = { displayName: "Donny", bio: "Just a bio" };

      await service.createProfileForUser(mockManager, 42, dto);

      expect(create).toHaveBeenCalledWith(Profile, {
        userId: 42,
        displayName: "Donny",
        bio: "Just a bio",
        profileImageUrl: null,
        isDude: false,
        ordainedDate: null,
      });
    });
  });

  // Sign up calls this inside its transaction, before it writes anything.
  describe("assertDisplayNameFree", () => {
    it("passes when no profile has the name", async () => {
      const exists = vi.fn().mockResolvedValue(false);
      const mockManager = { exists } as unknown as EntityManager;

      await expect(service.assertDisplayNameFree(mockManager, "The Dude")).resolves.toBeUndefined();
    });

    it("throws 409 DISPLAY_NAME_TAKEN when a profile has it", async () => {
      const exists = vi.fn().mockResolvedValue(true);
      const mockManager = { exists } as unknown as EntityManager;

      const attempt = service.assertDisplayNameFree(mockManager, "The Dude");

      await expect(attempt).rejects.toBeInstanceOf(ValueTakenException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "DISPLAY_NAME_TAKEN" });
    });

    // The name goes to Postgres as typed, and the citext column does the
    // case-insensitive compare. withDeleted, because the unique constraint
    // still covers a soft-deleted profile. The manager, not the repository,
    // so the read is part of the caller's transaction.
    it("asks Postgres, through the manager it is given, and includes deleted profiles", async () => {
      const exists = vi.fn().mockResolvedValue(false);
      const mockManager = { exists } as unknown as EntityManager;

      await service.assertDisplayNameFree(mockManager, "tHe DuDe");

      expect(exists).toHaveBeenCalledWith(Profile, {
        where: { displayName: "tHe DuDe" },
        withDeleted: true,
      });
    });
  });

  describe("softDeleteForUser", () => {
    it("soft-deletes the user's profile through the manager it is given", async () => {
      // Kept as its own variable so the assertion reads the mock directly,
      // not a method off the EntityManager-typed object.
      const softDelete = vi.fn().mockResolvedValue({ affected: 1 });
      const mockManager = { softDelete } as unknown as EntityManager;

      await service.softDeleteForUser(mockManager, 42);

      // The caller's manager, not profileRepository, so this runs inside the
      // caller's transaction. Scoped to a profile not already deleted.
      expect(softDelete).toHaveBeenCalledWith(Profile, {
        userId: 42,
        deletedAt: IsNull(),
      });
      expect(profileRepository.update).not.toHaveBeenCalled();
    });
  });

  describe("restoreForUser", () => {
    it("restores the user's profile through the manager it is given", async () => {
      // Kept as its own variable so the assertion reads the mock directly,
      // not a method off the EntityManager-typed object.
      const restore = vi.fn().mockResolvedValue({ affected: 1 });
      const mockManager = { restore } as unknown as EntityManager;

      await service.restoreForUser(mockManager, 42);

      // The caller's manager, so this runs inside the caller's transaction.
      // Scoped to a profile that is actually soft-deleted.
      expect(restore).toHaveBeenCalledWith(Profile, {
        userId: 42,
        deletedAt: Not(IsNull()),
      });
    });
  });

  describe("updateProfile", () => {
    it("updates a profile and returns the updated profile", async () => {
      profileRepository.update.mockResolvedValue({ affected: 1 });
      profileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.updateProfile(1, { bio: "Updated bio" }, owner);

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull(), userId: 42 },
        { bio: "Updated bio" },
      );
      expect(result.bio).toBe("Hello world");
    });

    // not.toHaveBeenCalled() is the point: the guard has to run before
    // TypeORM gets an empty set and throws UpdateValuesMissingError as a 500.
    it("throws 400 when the body carries no fields", async () => {
      await expect(service.updateProfile(1, {}, owner)).rejects.toBeInstanceOf(BadRequestException);
      expect(profileRepository.update).not.toHaveBeenCalled();
    });

    // update() skips the soft-delete filter that find() applies, so the
    // criteria has to carry it or a deleted profile gets edited.
    it("throws NotFoundException when the profile is soft-deleted", async () => {
      profileRepository.update.mockResolvedValue({ affected: 0 });
      // findOne is the failure-path read that tells a missing profile from
      // someone else's. A soft-deleted profile is not found, so it is a 404.
      profileRepository.findOne.mockResolvedValue(null);

      await expect(service.updateProfile(1, { bio: "x" }, owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws NotFoundException when updating a profile that does not exist", async () => {
      profileRepository.update.mockResolvedValue({ affected: 0 });
      profileRepository.findOne.mockResolvedValue(null);

      await expect(service.updateProfile(999, { bio: "x" }, owner)).rejects.toThrow(
        "Profile #999 not found",
      );
    });

    it("updates only the fields provided", async () => {
      profileRepository.update.mockResolvedValue({ affected: 1 });
      profileRepository.findOne.mockResolvedValue(mockProfile);

      await service.updateProfile(1, { displayName: "El Duderino" }, owner);

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull(), userId: 42 },
        { displayName: "El Duderino" },
      );
    });

    // What TypeORM throws when Postgres refuses a duplicate. displayName is
    // the only unique column this DTO can write, so the service can name it.
    function uniqueViolation(): QueryFailedError {
      const driverError = Object.assign(new Error("duplicate key value"), { code: "23505" });
      return new QueryFailedError("UPDATE profile", [], driverError);
    }

    it("throws 409 DISPLAY_NAME_TAKEN when the unique constraint refuses the name", async () => {
      const refused = uniqueViolation();
      profileRepository.update.mockRejectedValue(refused);

      const attempt = service.updateProfile(1, { displayName: "Walter" }, owner);

      await expect(attempt).rejects.toBeInstanceOf(ValueTakenException);
      await expect(attempt).rejects.toMatchObject({
        errorCode: "DISPLAY_NAME_TAKEN",
        cause: refused,
      });
    });

    // Any other database error is not ours to rename. It goes on to
    // PgErrorFilter as it is.
    it("lets any other database error through unchanged", async () => {
      const driverError = Object.assign(new Error("deadlock detected"), { code: "40P01" });
      const fault = new QueryFailedError("UPDATE profile", [], driverError);
      profileRepository.update.mockRejectedValue(fault);

      await expect(service.updateProfile(1, { displayName: "Walter" }, owner)).rejects.toBe(fault);
    });

    // The reason there is no lookup before the write: the ownership rule in
    // the criteria has to answer first.
    it("answers 403, not 409, when a stranger sends a name", async () => {
      profileRepository.update.mockResolvedValue({ affected: 0 });
      profileRepository.findOne.mockResolvedValue(mockProfile);

      await expect(
        service.updateProfile(1, { displayName: "The Dude" }, other),
      ).rejects.toBeInstanceOf(NotOwnerException);
    });

    // The authorization rule is part of the update criteria, so a non-owner's
    // write matches no row rather than being refused after the fact.
    it("scopes the update to the caller's own profile", async () => {
      profileRepository.update.mockResolvedValue({ affected: 1 });
      profileRepository.findOne.mockResolvedValue(mockProfile);

      await service.updateProfile(1, { bio: "x" }, other);

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull(), userId: 7 },
        { bio: "x" },
      );
    });

    it("lets an admin update a profile that is not theirs", async () => {
      profileRepository.update.mockResolvedValue({ affected: 1 });
      profileRepository.findOne.mockResolvedValue(mockProfile);

      await service.updateProfile(1, { bio: "x" }, admin);

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull() },
        { bio: "x" },
      );
    });

    it("throws NotOwnerException when the profile exists but is someone else's", async () => {
      profileRepository.update.mockResolvedValue({ affected: 0 });
      // It exists, so nothing matching means the caller does not own it.
      profileRepository.findOne.mockResolvedValue(mockProfile);

      const attempt = service.updateProfile(1, { bio: "x" }, other);

      await expect(attempt).rejects.toBeInstanceOf(NotOwnerException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "NOT_OWNER" });
    });
  });
});
