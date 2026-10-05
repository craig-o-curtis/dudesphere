import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EntityManager, IsNull, Not } from "typeorm";

import { Profile } from "./profile.entity.js";
import { ProfileService } from "./profiles.service.js";

describe("ProfileService", () => {
  let service: ProfileService;
  let module: TestingModule;

  // A fake repository: only the methods ProfileService actually calls.
  const profileRepository = {
    find: vi.fn(),
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    module = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe("getProfiles", () => {
    it("returns all profiles with default pagination", async () => {
      profileRepository.find.mockResolvedValue([mockProfile]);

      const result = await service.getProfiles();

      expect(profileRepository.find).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].userId).toBe(42);
    });

    it("returns profiles with custom limit and page", async () => {
      profileRepository.find.mockResolvedValue([mockProfile]);

      await service.getProfiles(5, 2);

      expect(profileRepository.find).toHaveBeenCalledWith({
        skip: 5,
        take: 5,
      });
    });

    it("returns empty array when no profiles exist", async () => {
      profileRepository.find.mockResolvedValue([]);

      const result = await service.getProfiles();

      expect(result).toEqual([]);
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

      const result = await service.updateProfile(1, { bio: "Updated bio" });

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull() },
        { bio: "Updated bio" },
      );
      expect(result.bio).toBe("Hello world");
    });

    // not.toHaveBeenCalled() is the point: the guard has to run before
    // TypeORM gets an empty set and throws UpdateValuesMissingError as a 500.
    it("throws 400 when the body carries no fields", async () => {
      await expect(service.updateProfile(1, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(profileRepository.update).not.toHaveBeenCalled();
    });

    // update() skips the soft-delete filter that find() applies, so the
    // criteria has to carry it or a deleted profile gets edited.
    it("throws NotFoundException when the profile is soft-deleted", async () => {
      profileRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.updateProfile(1, { bio: "x" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(profileRepository.findOne).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when updating a profile that does not exist", async () => {
      profileRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.updateProfile(999, { bio: "x" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.updateProfile(999, { bio: "x" })).rejects.toThrow(
        "Profile #999 not found",
      );
    });

    it("updates only the fields provided", async () => {
      profileRepository.update.mockResolvedValue({ affected: 1 });
      profileRepository.findOne.mockResolvedValue(mockProfile);

      await service.updateProfile(1, { firstName: "Johnny" });

      expect(profileRepository.update).toHaveBeenCalledWith(
        { id: 1, deletedAt: IsNull() },
        { firstName: "Johnny" },
      );
    });
  });
});
