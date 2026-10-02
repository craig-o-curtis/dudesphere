import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, IsNull } from "typeorm";

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

  const usersRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
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
        { provide: getRepositoryToken(User), useValue: usersRepository },
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
      manager.findOne.mockResolvedValue({ id: 1, email: "d@x.com", username: "someoneelse" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toThrow("Email already registered");

      expect(manager.save).not.toHaveBeenCalled();
      expect(profileService.createForUser).not.toHaveBeenCalled();
    });

    it("throws 409 when the username is taken", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "other@x.com", username: "dude" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toThrow("Username already taken");

      expect(manager.save).not.toHaveBeenCalled();
    });

    // The unique indexes on email and username still cover soft-deleted rows,
    // so the conflict lookup has to see them or the insert fails as a 500.
    it("searches soft-deleted rows for both email and username", async () => {
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: 7, username: "dude", email: "d@x.com" });
      profileService.createForUser.mockResolvedValue({ id: 1, userId: 7 });

      await service.createUser({ username: "dude", email: "d@x.com", password: "secret1" });

      expect(manager.findOne).toHaveBeenCalledWith(User, {
        where: [{ email: "d@x.com" }, { username: "dude" }],
        withDeleted: true,
      });
    });

    it("throws 409 when the email belongs to a soft-deleted user", async () => {
      manager.findOne.mockResolvedValue({
        id: 1,
        email: "d@x.com",
        username: "ghost",
        deletedAt: "2026-01-01T00:00:00.000Z",
      });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe("updateUser", () => {
    // update() does not apply the soft-delete filter that find() does, so the
    // criteria has to carry it or a deleted row gets mutated behind a 404.
    it("scopes the update to rows that are not soft-deleted", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue({
        id: 3,
        username: "dude",
        email: "d@x.com",
        role: "user",
      });

      await service.updateUser(3, { password: "secret2" });

      expect(usersRepository.update).toHaveBeenCalledWith(
        { id: 3, deletedAt: IsNull() },
        {
          password: "secret2",
        },
      );
    });

    it("throws 404 when the user is already soft-deleted", async () => {
      usersRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.updateUser(3, { password: "secret2" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws 409 when another user already holds the username", async () => {
      usersRepository.findOne.mockResolvedValue({ id: 9, email: "o@x.com", username: "dude" });

      await expect(service.updateUser(3, { username: "dude" })).rejects.toThrow(
        "Username already taken",
      );

      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("allows a user to keep its own email", async () => {
      usersRepository.findOne.mockResolvedValueOnce({ id: 3, email: "d@x.com", username: "dude" });
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValueOnce({
        id: 3,
        username: "dude",
        email: "d@x.com",
        role: "user",
      });

      await expect(service.updateUser(3, { email: "d@x.com" })).resolves.toMatchObject({ id: 3 });
    });
  });

  describe("deleteUser", () => {
    it("scopes the soft delete to rows that are not already deleted", async () => {
      usersRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.deleteUser(3);

      expect(usersRepository.softDelete).toHaveBeenCalledWith({ id: 3, deletedAt: IsNull() });
    });

    it("throws 404 when the user is already soft-deleted", async () => {
      usersRepository.softDelete.mockResolvedValue({ affected: 0 });

      await expect(service.deleteUser(3)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
