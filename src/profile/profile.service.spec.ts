import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Profile } from "./profile.entity.js";
import { ProfileService } from "./profile.service.js";

describe("ProfileService", () => {
  let service: ProfileService;

  // A fake repository: only the methods ProfileService actually calls.
  const profileRepository = {
    findOne: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ProfileService,
        // Provide the fake under the same token @InjectRepository(Profile) asks for
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  it("returns the profile for a user", async () => {
    profileRepository.findOne.mockResolvedValue({ id: 7, userId: 3, isDude: true });

    const result = await service.getProfileByUserId(3);

    expect(profileRepository.findOne).toHaveBeenCalledWith({ where: { userId: 3 } });
    expect(result.id).toBe(7);
  });

  it("throws NotFoundException when the user has no profile", async () => {
    profileRepository.findOne.mockResolvedValue(null);

    await expect(service.getProfileByUserId(3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when updating a profile that does not exist", async () => {
    profileRepository.update.mockResolvedValue({ affected: 0 });

    await expect(service.updateProfile(999, { bio: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
