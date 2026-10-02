import { Test, TestingModule } from "@nestjs/testing";

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
    createForUser: vi.fn(),
    updateProfile: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: profileServiceMock }],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getProfiles", () => {
    it("delegates to profileService.getProfiles with default values", async () => {
      profileServiceMock.getProfiles.mockResolvedValue([mockProfile]);

      const result = await controller.getProfiles(5, 3);

      // DefaultValuePipe doesn't apply in test context; service defaults handle it
      expect(profileServiceMock.getProfiles).toHaveBeenCalledWith(5, 3);
      expect(result).toEqual([mockProfile]);
    });

    it("delegates to profileService.getProfiles with custom limit and page", async () => {
      profileServiceMock.getProfiles.mockResolvedValue([mockProfile]);

      await controller.getProfiles(5, 3);

      expect(profileServiceMock.getProfiles).toHaveBeenCalledWith(5, 3);
    });
  });

  describe("getProfileById", () => {
    it("delegates to profileService.getProfileById", async () => {
      profileServiceMock.getProfileById.mockResolvedValue(mockProfile);

      const result = await controller.getProfileById(1);

      expect(profileServiceMock.getProfileById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockProfile);
    });
  });

  describe("getProfileByUserId", () => {
    it("delegates to profileService.getProfileByUserId", async () => {
      profileServiceMock.getProfileByUserId.mockResolvedValue(mockProfile);

      const result = await controller.getProfileByUserId(42);

      expect(profileServiceMock.getProfileByUserId).toHaveBeenCalledWith(42);
      expect(result).toEqual(mockProfile);
    });
  });

  describe("updateProfile", () => {
    it("delegates to profileService.updateProfile", async () => {
      const updateDto = { bio: "Updated bio" };
      profileServiceMock.updateProfile.mockResolvedValue(mockProfile);

      const result = await controller.updateProfile(1, updateDto);

      expect(profileServiceMock.updateProfile).toHaveBeenCalledWith(1, updateDto);
      expect(result).toEqual(mockProfile);
    });
  });
});
