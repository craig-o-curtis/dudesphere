import { Test, TestingModule } from "@nestjs/testing";

import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { type User, UserRole } from "../users/user.entity.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesService } from "./profiles.service.js";

describe("ProfilesController", () => {
  let controller: ProfilesController;

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

  // The user AuthenticationModule's guard puts on the request: the User row
  // JwtAuth loads, without the password hash, as UsersRepository returns it.
  function member(id: number, username: string, role: UserRole): User {
    return {
      id,
      username,
      email: `${username}@example.com`,
      role,
      passwordChangedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    } as User;
  }

  const profilesServiceMock = {
    getProfiles: vi.fn(),
    getProfileById: vi.fn(),
    getProfileByUserId: vi.fn(),
    updateProfile: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        { provide: ProfilesService, useValue: profilesServiceMock },
        // The real one: it has no dependencies, and it builds the links these tests read.
        PaginationProvider,
      ],
      // No guard runs here: the guards are APP_GUARDs in AppModule, which this
      // module does not load. The e2e suites cover them.
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getProfiles", () => {
    it("delegates to ProfilesService.getProfiles with the limit and page, and wraps its page", async () => {
      const profiles = [mockProfile];
      profilesServiceMock.getProfiles.mockResolvedValue({ items: profiles, total: 11 });

      const result = await controller.getProfiles({ limit: 5, page: 3 });

      expect(profilesServiceMock.getProfiles).toHaveBeenCalledWith({ limit: 5, page: 3 });
      // toBe: the service's own array, not a copy of it.
      expect(result.data).toBe(profiles);
      expect(result.meta).toEqual({
        itemsPerPage: 5,
        totalItems: 11,
        currentPage: 3,
        totalPages: 3,
      });
      expect(result.links.previous).toBe("/profiles?limit=5&page=2");
      expect(result.links.next).toBeNull();
    });
  });

  describe("getMyProfile", () => {
    it("asks for the profile of the user on the request", async () => {
      profilesServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);

      const result = await controller.getMyProfile(member(25, "walter", UserRole.USER));

      expect(profilesServiceMock.getProfileByUserId).toHaveBeenCalledWith(25);
      expect(result).toBe(mockProfile);
    });
  });

  describe("getProfileById", () => {
    it("delegates to ProfilesService.getProfileById", async () => {
      profilesServiceMock.getProfileById.mockResolvedValue(mockProfile);

      const result = await controller.getProfileById({ id: 1 });

      expect(profilesServiceMock.getProfileById).toHaveBeenCalledWith(1);
      expect(result).toBe(mockProfile);
    });
  });

  describe("getProfileByUserId", () => {
    it("delegates to ProfilesService.getProfileByUserId", async () => {
      profilesServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);

      const result = await controller.getProfileByUserId({ id: 42 });

      expect(profilesServiceMock.getProfileByUserId).toHaveBeenCalledWith(42);
      expect(result).toBe(mockProfile);
    });
  });

  describe("updateMyProfile", () => {
    it("fetches the profile by user id then updates it with the body", async () => {
      const updateDto = { bio: "Updated bio" };
      profilesServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);
      profilesServiceMock.updateProfile.mockResolvedValue({ ...mockProfile, bio: "Updated bio" });

      const caller = member(42, "dude", UserRole.USER);

      const result = await controller.updateMyProfile(updateDto, caller);

      expect(profilesServiceMock.getProfileByUserId).toHaveBeenCalledWith(42);
      expect(profilesServiceMock.updateProfile).toHaveBeenCalledWith(
        mockProfile.id,
        updateDto,
        caller,
      );
      expect(result).toEqual({ ...mockProfile, bio: "Updated bio" });
    });
  });

  describe("updateProfile", () => {
    it("delegates to ProfilesService.updateProfile", async () => {
      const updateDto = { bio: "Updated bio" };
      profilesServiceMock.updateProfile.mockResolvedValue(mockProfile);

      const caller = member(42, "dude", UserRole.USER);

      const result = await controller.updateProfile({ id: 1 }, updateDto, caller);

      // The controller passes the caller straight through; the rule itself is
      // the service's, and is tested in profiles.service.spec.ts.
      expect(profilesServiceMock.updateProfile).toHaveBeenCalledWith(1, updateDto, caller);
      expect(result).toBe(mockProfile);
    });
  });
});
