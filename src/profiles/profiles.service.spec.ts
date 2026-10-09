import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EntityManager, IsNull, Not } from "typeorm";

import type { AuthUser } from "../auth/auth-user.js";
import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
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
    firstName: "John",
    lastName: "Doe",
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
      expect(result.firstName).toBe("John");
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

  describe("createProfileForUser", () => {
    it("creates a profile with minimal data (no DTO)", async () => {
      const create = vi.fn().mockReturnValue(mockProfile);
      const save = vi.fn().mockResolvedValue(mockProfile);
      const mockManager = { create, save } as unknown as EntityManager;

      const result = await service.createProfileForUser(mockManager, 42);

      expect(create).toHaveBeenCalledWith(Profile, {
        userId: 42,
        firstName: null,
        lastName: null,
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
        firstName: "Jane",
        lastName: "Smith",
        bio: "A great bio",
        profileImageUrl: "https://example.com/jane.jpg",
        isDude: true,
        ordainedDate: "2026-06-15T12:00:00.000Z",
      };

      const result = await service.createProfileForUser(mockManager, 42, dto);

      expect(create).toHaveBeenCalledWith(Profile, {
        userId: 42,
        firstName: "Jane",
        lastName: "Smith",
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

      const dto = { bio: "Just a bio" };

      await service.createProfileForUser(mockManager, 42, dto);

      expect(create).toHaveBeenCalledWith(Profile, {
        userId: 42,
        firstName: null,
        lastName: null,
        bio: "Just a bio",
        profileImageUrl: null,
        isDude: false,
        ordainedDate: null,
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

      await service.updateProfile(1, { firstName: "Johnny" }, owner);

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull(), userId: 42 },
        { firstName: "Johnny" },
      );
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
