import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Not } from "typeorm";

import { UserAbidingsService } from "../abidings/user-abidings.service.js";
import { HashingProvider } from "../hashing/hashing.provider.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { User } from "./user.entity.js";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  let service: UsersService;

  // A fake EntityManager: what the transaction callback receives.
  const manager = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };

  // A fake DataSource whose transaction() just runs the callback with our fake manager.
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) => callback(manager)),
  };

  const usersRepository = {
    find: vi.fn(),
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  const profilesService = {
    createProfileForUser: vi.fn(),
    softDeleteForUser: vi.fn(),
    restoreForUser: vi.fn(),
  };

  const userAbidingsService = {
    softDeleteForUser: vi.fn(),
    restoreForUser: vi.fn(),
  };

  // A fake hasher, so no test here runs bcrypt. hash() wraps its input, which
  // makes a stored hash easy to tell from the password it came from.
  const hashingProvider = {
    hash: vi.fn(),
    compare: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.create.mockImplementation((_entity: unknown, values: object) => values);
    hashingProvider.hash.mockImplementation((plain: string) => Promise.resolve(`hashed(${plain})`));

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: ProfilesService, useValue: profilesService },
        { provide: UserAbidingsService, useValue: userAbidingsService },
        { provide: HashingProvider, useValue: hashingProvider },
        // The real one. It has no dependencies, and getUsers is tested through it.
        PaginationProvider,
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe("getUsers", () => {
    it("returns the first page with the count of every user", async () => {
      usersRepository.findAndCount.mockResolvedValue([
        [{ id: 4, username: "walter", email: "w@x.com", role: "user" }],
        37,
      ]);

      const result = await service.getUsers({ limit: 10, page: 1 });

      expect(usersRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: "ASC" },
        skip: 0,
        take: 10,
      });
      expect(result.items.map((u) => u.username)).toEqual(["walter"]);
      expect(result.total).toBe(37);
    });

    it("skips the earlier pages when given a limit and a page", async () => {
      usersRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getUsers({ limit: 5, page: 3 });

      expect(usersRepository.findAndCount).toHaveBeenCalledWith({
        order: { id: "ASC" },
        skip: 10,
        take: 5,
      });
    });

    it("returns no items and a total of 0 when there are no users", async () => {
      usersRepository.findAndCount.mockResolvedValue([[], 0]);

      expect(await service.getUsers({ limit: 10, page: 1 })).toEqual({ items: [], total: 0 });
    });
  });

  describe("getUsersByIds", () => {
    it("loads only the requested users in one query", async () => {
      usersRepository.find.mockResolvedValue([
        { id: 4, username: "walter", email: "w@x.com", role: "user" },
      ]);

      const result = await service.getUsersByIds([4]);

      // withDeleted: a soft-deleted author still gets their name shown.
      expect(usersRepository.find).toHaveBeenCalledWith({
        where: { id: In([4]) },
        withDeleted: true,
      });
      expect(result.map((u) => u.username)).toEqual(["walter"]);
    });

    it("skips the query when there are no ids", async () => {
      await expect(service.getUsersByIds([])).resolves.toEqual([]);
      expect(usersRepository.find).not.toHaveBeenCalled();
    });
  });

  describe("getUserByCredentials", () => {
    const storedUser = {
      id: 4,
      username: "walter",
      email: "w@x.com",
      password: "hashed(secret1)",
      role: "user",
    };

    it("returns the user, without the password, when the hasher says it matches", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      hashingProvider.compare.mockResolvedValue(true);

      const result = await service.getUserByCredentials("w@x.com", "secret1");

      // No withDeleted, so a soft-deleted user is not found and can't log in.
      expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { email: "w@x.com" } });
      // The typed password first, the stored hash second.
      expect(hashingProvider.compare).toHaveBeenCalledWith("secret1", "hashed(secret1)");
      expect(result).toMatchObject({ id: 4, username: "walter" });
      expect(result?.password).toBeUndefined();
    });

    it("returns null when the hasher says the password is wrong", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      hashingProvider.compare.mockResolvedValue(false);

      await expect(service.getUserByCredentials("w@x.com", "wrong-one")).resolves.toBeNull();
    });

    // The compare still runs, against no hash, so an unknown email takes as
    // long to reject as a wrong password.
    it("returns null when no user has that email, and still runs the compare", async () => {
      usersRepository.findOne.mockResolvedValue(null);
      hashingProvider.compare.mockResolvedValue(false);

      await expect(service.getUserByCredentials("no@x.com", "secret1")).resolves.toBeNull();
      expect(hashingProvider.compare).toHaveBeenCalledWith("secret1", undefined);
    });
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
      profilesService.createProfileForUser.mockResolvedValue(mockProfile);

      const result = await service.createUser({
        username: "dude",
        email: "d@x.com",
        password: "secret1",
        profile: { firstName: "The" },
      });

      // Both writes happen inside one transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // The user is saved through the transaction's manager, not the repository.
      // The hash is what gets stored, never the password itself.
      expect(hashingProvider.hash).toHaveBeenCalledWith("secret1");
      expect(manager.save).toHaveBeenCalledWith(User, {
        username: "dude",
        email: "d@x.com",
        password: "hashed(secret1)",
      });
      // The profile is created with that same manager, for the id the insert returned.
      expect(profilesService.createProfileForUser).toHaveBeenCalledWith(manager, mockUserId, {
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
      profilesService.createProfileForUser.mockRejectedValue(new Error("profile insert failed"));

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toThrow("profile insert failed");
    });

    it("throws 409 and creates nothing when the email is taken", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "d@x.com", username: "someoneelse" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toMatchObject({ message: "Email already registered", errorCode: "EMAIL_TAKEN" });

      expect(manager.save).not.toHaveBeenCalled();
      expect(profilesService.createProfileForUser).not.toHaveBeenCalled();
    });

    it("throws 409 when the username is taken", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "other@x.com", username: "dude" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toMatchObject({ message: "Username already taken", errorCode: "USERNAME_TAKEN" });

      expect(manager.save).not.toHaveBeenCalled();
    });

    // The unique indexes on email and username still cover soft-deleted rows,
    // so the conflict lookup has to see them or the insert fails as a 500.
    it("searches soft-deleted rows for both email and username", async () => {
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: 7, username: "dude", email: "d@x.com" });
      profilesService.createProfileForUser.mockResolvedValue({ id: 1, userId: 7 });

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
        deletedAt: "2026-10-06T00:00:00.000Z",
      });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1" }),
      ).rejects.toBeInstanceOf(ValueTakenException);

      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe("updateMyUser", () => {
    const storedUser = { id: 3, username: "dude", email: "d@x.com", password: "hashed(secret1)" };

    it("sets a new password when the current one is right", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      usersRepository.update.mockResolvedValue({ affected: 1 });
      hashingProvider.compare.mockResolvedValue(true);

      await service.updateMyUser(3, { password: "secret2", currentPassword: "secret1" });

      expect(hashingProvider.compare).toHaveBeenCalledWith("secret1", "hashed(secret1)");
      // currentPassword is not a column, so it must not reach the update.
      expect(usersRepository.update).toHaveBeenCalledWith(
        { id: 3, deletedAt: IsNull() },
        { password: "hashed(secret2)" },
      );
    });

    it("throws 400 when a new password comes without the current one", async () => {
      await expect(service.updateMyUser(3, { password: "secret2" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("throws 403 and changes nothing when the current password is wrong", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      hashingProvider.compare.mockResolvedValue(false);

      const attempt = service.updateMyUser(3, { password: "secret2", currentPassword: "not-it" });

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "WRONG_PASSWORD" });
      expect(hashingProvider.hash).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("does not ask for the current password when no new one is set", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 3, username: "donny", email: "d@x.com" });

      await service.updateMyUser(3, { username: "donny" });

      expect(hashingProvider.compare).not.toHaveBeenCalled();
      expect(usersRepository.update).toHaveBeenCalledWith(expect.anything(), { username: "donny" });
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
          password: "hashed(secret2)",
        },
      );
    });

    it("stores a new password as a hash", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue({ id: 3, username: "dude", email: "d@x.com" });

      await service.updateUser(3, { password: "secret2" });

      expect(hashingProvider.hash).toHaveBeenCalledWith("secret2");
      expect(usersRepository.update).toHaveBeenCalledWith(expect.anything(), {
        password: "hashed(secret2)",
      });
    });

    it("does not hash anything when the body has no password", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 3, username: "donny", email: "d@x.com" });

      await service.updateUser(3, { username: "donny" });

      expect(hashingProvider.hash).not.toHaveBeenCalled();
      expect(usersRepository.update).toHaveBeenCalledWith(expect.anything(), { username: "donny" });
    });

    it("throws 400 when the body carries no user fields", async () => {
      await expect(service.updateUser(3, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("throws 400 when the body carries only profile fields", async () => {
      await expect(
        service.updateUser(3, { profile: { firstName: "Dude" } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.update).not.toHaveBeenCalled();
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

    // Two things the conflict lookup must do. It leaves the caller's own row
    // out, so sending your own email with someone else's username can't return
    // your own row and hide the conflict. And it searches soft-deleted rows,
    // because the unique indexes still cover them.
    it("searches other users' rows, deleted ones included, for the email and username", async () => {
      usersRepository.findOne.mockResolvedValueOnce({
        id: 9,
        email: "o@x.com",
        username: "walter",
      });

      await expect(service.updateUser(3, { email: "d@x.com", username: "walter" })).rejects.toThrow(
        "Username already taken",
      );

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: [
          { email: "d@x.com", id: Not(3) },
          { username: "walter", id: Not(3) },
        ],
        withDeleted: true,
      });
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("allows a user to keep its own email", async () => {
      // The lookup leaves out the user's own row, so it finds nothing.
      usersRepository.findOne.mockResolvedValueOnce(null);
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
    it("soft-deletes the user and its profile using the SAME transaction manager", async () => {
      const mockUserId = 3;
      manager.softDelete.mockResolvedValue({ affected: 1 });

      await service.deleteUser(mockUserId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // Scoped to rows not already deleted, so a second delete is a 404.
      expect(manager.softDelete).toHaveBeenCalledWith(User, { id: 3, deletedAt: IsNull() });
      // The profile goes through the same manager, so both commit or roll back together.
      expect(profilesService.softDeleteForUser).toHaveBeenCalledWith(manager, mockUserId);
      expect(userAbidingsService.softDeleteForUser).toHaveBeenCalledWith(mockUserId);
    });

    // Mongo is outside the Postgres transaction, so it has to run last: a
    // failure before it must not leave the abidings hidden.
    it("soft-deletes the abidings after the user and profile", async () => {
      manager.softDelete.mockResolvedValue({ affected: 1 });

      await service.deleteUser(3);

      expect(userAbidingsService.softDeleteForUser.mock.invocationCallOrder[0]).toBeGreaterThan(
        profilesService.softDeleteForUser.mock.invocationCallOrder[0],
      );
    });

    it("throws 404 and leaves the profile alone when the user is already soft-deleted", async () => {
      manager.softDelete.mockResolvedValue({ affected: 0 });

      await expect(service.deleteUser(3)).rejects.toBeInstanceOf(NotFoundException);

      expect(profilesService.softDeleteForUser).not.toHaveBeenCalled();
      expect(userAbidingsService.softDeleteForUser).not.toHaveBeenCalled();
    });

    // As with createUser: the error has to escape the transaction callback,
    // because that is what tells TypeORM to undo the user's soft delete.
    it("rejects when the profile soft delete fails, so the user soft delete rolls back", async () => {
      manager.softDelete.mockResolvedValue({ affected: 1 });
      profilesService.softDeleteForUser.mockRejectedValueOnce(new Error("profile update failed"));

      await expect(service.deleteUser(3)).rejects.toThrow("profile update failed");

      expect(userAbidingsService.softDeleteForUser).not.toHaveBeenCalled();
    });

    it("rejects when the abidings soft delete fails, so the user soft delete rolls back", async () => {
      manager.softDelete.mockResolvedValue({ affected: 1 });
      userAbidingsService.softDeleteForUser.mockRejectedValueOnce(new Error("mongo down"));

      await expect(service.deleteUser(3)).rejects.toThrow("mongo down");
    });
  });

  describe("restoreUser", () => {
    it("restores the user and its profile using the SAME transaction manager", async () => {
      const restoredUser = { id: 3, username: "dude", email: "d@x.com", role: "user" };
      manager.restore.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue(restoredUser);

      const result = await service.restoreUser(restoredUser.id);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // Scoped to a soft-deleted row, so restoring an active user is a 404.
      expect(manager.restore).toHaveBeenCalledWith(User, { id: 3, deletedAt: Not(IsNull()) });
      // The profile goes through the same manager, so both commit or roll back together.
      expect(profilesService.restoreForUser).toHaveBeenCalledWith(manager, 3);
      expect(userAbidingsService.restoreForUser).toHaveBeenCalledWith(3);
      expect(userAbidingsService.restoreForUser.mock.invocationCallOrder[0]).toBeGreaterThan(
        profilesService.restoreForUser.mock.invocationCallOrder[0],
      );
      // The response is the restored user, read back after the transaction.
      expect(result).toMatchObject(restoredUser);
    });

    it("throws 404 and leaves the profile alone when the user is not soft-deleted", async () => {
      manager.restore.mockResolvedValue({ affected: 0 });

      await expect(service.restoreUser(3)).rejects.toThrow("Deleted user #3 not found");

      expect(profilesService.restoreForUser).not.toHaveBeenCalled();
      expect(userAbidingsService.restoreForUser).not.toHaveBeenCalled();
      expect(usersRepository.findOne).not.toHaveBeenCalled();
    });

    // As with deleteUser: the error has to escape the transaction callback,
    // because that is what tells TypeORM to undo the user's restore.
    it("rejects when the profile restore fails, so the user restore rolls back", async () => {
      manager.restore.mockResolvedValue({ affected: 1 });
      profilesService.restoreForUser.mockRejectedValueOnce(new Error("profile restore failed"));

      await expect(service.restoreUser(3)).rejects.toThrow("profile restore failed");

      expect(userAbidingsService.restoreForUser).not.toHaveBeenCalled();
      expect(usersRepository.findOne).not.toHaveBeenCalled();
    });

    it("rejects when the abidings restore fails, so the user restore rolls back", async () => {
      manager.restore.mockResolvedValue({ affected: 1 });
      userAbidingsService.restoreForUser.mockRejectedValueOnce(new Error("mongo down"));

      await expect(service.restoreUser(3)).rejects.toThrow("mongo down");

      expect(usersRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
