import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { ProfileService } from "../profile/profile.service.js";
import { User } from "./user.entity.js";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  let service: UsersService;

  // A fake EntityManager: what the transaction callback receives.
  const manager = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  // A fake DataSource whose transaction() just runs the callback with our fake manager.
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) => callback(manager)),
  };

  const profileService = {
    createForUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.create.mockImplementation((_entity: unknown, values: object) => values);

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: ProfileService, useValue: profileService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it("creates the user and the profile using the SAME transaction manager", async () => {
    manager.findOne.mockResolvedValue(null);
    manager.save.mockResolvedValue({ id: 42, username: "dude", email: "d@x.com" });
    profileService.createForUser.mockResolvedValue({ id: 1, userId: 42, isDude: true });

    const result = await service.createUser({
      username: "dude",
      email: "d@x.com",
      password: "secret1",
      profile: { firstName: "The" },
    });

    // This is the important assertion: the profile was created with the
    // transaction's manager, so it rolls back together with the user.
    expect(profileService.createForUser).toHaveBeenCalledWith(manager, 42, { firstName: "The" });
    expect(result.id).toBe(42);
    expect(result.profile?.userId).toBe(42);
  });

  it("throws 409 and creates nothing when the email is taken", async () => {
    manager.findOne.mockResolvedValue({ id: 1 });

    await expect(
      service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(manager.save).not.toHaveBeenCalled();
    expect(profileService.createForUser).not.toHaveBeenCalled();
  });
});
