import { Test, TestingModule } from "@nestjs/testing";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { ProfileController } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";

describe("ProfileController", () => {
  let controller: ProfileController;

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

  const profileServiceMock = {
    getProfiles: vi.fn(),
    getProfileById: vi.fn(),
    getProfileByUserId: vi.fn(),
    updateProfile: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: profileServiceMock }],
    })
      // Guards only run on real requests. The e2e test covers this one.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getProfiles", () => {
    // The defaults come from DefaultValuePipe, which only runs on a real
    // request, so a unit test can't cover them.
    it("delegates to profileService.getProfiles with the limit and page", async () => {
      const profiles = [mockProfile];
      profileServiceMock.getProfiles.mockResolvedValue(profiles);

      const result = await controller.getProfiles(5, 3);

      expect(profileServiceMock.getProfiles).toHaveBeenCalledWith(5, 3);
      expect(result).toBe(profiles);
    });
  });

  describe("getMyProfile", () => {
    it("asks for the profile of the user on the request", async () => {
      profileServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);

      const result = await controller.getMyProfile({
        userId: 25,
        username: "walter",
        role: "user",
      });

      expect(profileServiceMock.getProfileByUserId).toHaveBeenCalledWith(25);
      expect(result).toBe(mockProfile);
    });
  });

  describe("getProfileById", () => {
    it("delegates to profileService.getProfileById", async () => {
      profileServiceMock.getProfileById.mockResolvedValue(mockProfile);

      const result = await controller.getProfileById(1);

      expect(profileServiceMock.getProfileById).toHaveBeenCalledWith(1);
      expect(result).toBe(mockProfile);
    });
  });

  describe("getProfileByUserId", () => {
    it("delegates to profileService.getProfileByUserId", async () => {
      profileServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);

      const result = await controller.getProfileByUserId(42);

      expect(profileServiceMock.getProfileByUserId).toHaveBeenCalledWith(42);
      expect(result).toBe(mockProfile);
    });
  });

  describe("updateMyProfile", () => {
    it("fetches the profile by user id then updates it with the body", async () => {
      const updateDto = { bio: "Updated bio" };
      profileServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);
      profileServiceMock.updateProfile.mockResolvedValue({ ...mockProfile, bio: "Updated bio" });

      const result = await controller.updateMyProfile(updateDto, {
        userId: 42,
        username: "dude",
        role: "user",
      });

      expect(profileServiceMock.getProfileByUserId).toHaveBeenCalledWith(42);
      expect(profileServiceMock.updateProfile).toHaveBeenCalledWith(mockProfile.id, updateDto);
      expect(result).toEqual({ ...mockProfile, bio: "Updated bio" });
    });
  });

  describe("updateProfile", () => {
    it("delegates to profileService.updateProfile", async () => {
      const updateDto = { bio: "Updated bio" };
      profileServiceMock.updateProfile.mockResolvedValue(mockProfile);

      const result = await controller.updateProfile(1, updateDto);

      expect(profileServiceMock.updateProfile).toHaveBeenCalledWith(1, updateDto);
      expect(result).toBe(mockProfile);
    });
  });
});
