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

  describe("createUser", () => {
    it("creates the user and the profile using the SAME transaction manager", async () => {
      // By `SAME transaction manager` we mean the user insert and the profile
      // insert both run through the `manager` the transaction hands us, so they
      // commit or roll back together.
      const mockUserId = 42;
      const mockProfile = { id: 1, userId: mockUserId, isDude: true };
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: mockUserId, username: "dude", email: "d@x.com" });
      profileService.createForUser.mockResolvedValue(mockProfile);

      const result = await service.createUser({
        username: "dude",
        email: "d@x.com",
        password: "secret1",
        profile: { firstName: "The" },
      });

      // Both writes happen inside one transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // The user is saved through the transaction's manager, not the repository.
      expect(manager.save).toHaveBeenCalledWith(User, {
        username: "dude",
        email: "d@x.com",
        password: "secret1",
      });
      // The profile is created with that same manager, for the id the insert returned.
      expect(profileService.createForUser).toHaveBeenCalledWith(manager, mockUserId, {
        firstName: "The",
      });
      // The response carries the new user and the profile created for it, and
      // never echoes the password back.
      expect(result.id).toBe(mockUserId);
      expect(result.profile).toMatchObject(mockProfile);
      expect(result.password).toBeUndefined();
    });

    // Postgres does the actual rollback. The service's job is to let the error
    // escape the transaction callback, because that is what tells TypeORM to
    // undo the user insert. Catching it here would commit a user with no profile.
    it("rejects when the profile insert fails, so the user insert rolls back", async () => {
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: 42, username: "dude", email: "d@x.com" });
      profileService.createForUser.mockRejectedValue(new Error("profile insert failed"));

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toThrow("profile insert failed");
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
});
