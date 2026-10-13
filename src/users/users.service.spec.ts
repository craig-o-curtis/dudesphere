import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { isValidUtc } from "@northguild/gmt";
import { DataSource, IsNull, Not } from "typeorm";

import { UserAbidingsService } from "../abidings/user-abidings.service.js";
import { RefreshTokensService } from "../auth/sessions/refresh-tokens.service.js";
import { HashingProvider } from "../hashing/hashing.provider.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import type { AuthUser } from "../shared/guards/auth-user.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { User, UserRole } from "./user.entity.js";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  let service: UsersService;

  // A fake EntityManager: what the transaction callback receives.
  const manager = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };

  // A fake DataSource whose transaction() just runs the callback with our fake manager.
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) => callback(manager)),
  };

  // One query builder stands for every createQueryBuilder() call. Each step
  // returns it, as TypeORM's does, and getOne() is what a test sets.
  const queryBuilder = {
    select: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    getOne: vi.fn(),
  };

  const usersRepository = {
    find: vi.fn(),
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const profilesService = {
    assertDisplayNameFree: vi.fn(),
    createProfileForUser: vi.fn(),
    softDeleteForUser: vi.fn(),
    restoreForUser: vi.fn(),
  };

  const userAbidingsService = {
    softDeleteForUser: vi.fn(),
    restoreForUser: vi.fn(),
  };

  // Ends a member's sessions. UsersService calls it when a password is set
  // and when an account is closed.
  const refreshTokens = { revokeAllForUser: vi.fn() };

  // A fake hasher, so no test here runs bcrypt. hashPassword() wraps its
  // input, which makes a stored hash easy to tell from the password it came
  // from.
  const hashingProvider = {
    hashPassword: vi.fn(),
    comparePassword: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.create.mockImplementation((_entity: unknown, values: object) => values);
    hashingProvider.hashPassword.mockImplementation((plain: string) =>
      Promise.resolve(`hashed(${plain})`),
    );
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    usersRepository.createQueryBuilder.mockReturnValue(queryBuilder);

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
        { provide: RefreshTokensService, useValue: refreshTokens },
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

  // What JwtAuthGuard calls on every signed-in request. The SQL itself is
  // proved against the real database, in test/authorization.e2e-spec.ts and
  // test/delete-me.e2e-spec.ts. These cases cover what the method does with
  // the answer.
  describe("getUserForToken", () => {
    it("returns who the user is now, in the shape the guards read", async () => {
      queryBuilder.getOne.mockResolvedValue({ id: 25, username: "walter", role: UserRole.ADMIN });

      const user = await service.getUserForToken(25, 1_800_000_000);

      expect(user).toEqual({ userId: 25, username: "walter", role: UserRole.ADMIN });
      expect(queryBuilder.where).toHaveBeenCalledWith("user.id = :id", { id: 25 });
    });

    // Three columns and no join, because this runs on every request.
    it("reads only the id, the username and the role", async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await service.getUserForToken(25, 1_800_000_000);

      expect(queryBuilder.select).toHaveBeenCalledWith(["user.id", "user.username", "user.role"]);
    });

    it("leaves soft-deleted users out", async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await service.getUserForToken(25, 1_800_000_000);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith("user.deletedAt IS NULL");
    });

    // The time the token was signed goes to the query, where Postgres
    // compares it with passwordChangedAt. test/passwords.e2e-spec.ts proves
    // the comparison itself.
    it("hands the query the time the token was signed", async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await service.getUserForToken(25, 1_800_000_000);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("passwordChangedAt"),
        { issuedAt: 1_800_000_000 },
      );
    });

    // Null, not a 404. The guard turns it into a 401.
    it("returns null when there is no such user", async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(service.getUserForToken(2_000_000_000, 1_800_000_000)).resolves.toBeNull();
    });
  });

  // What SessionsService.refresh asks before it hands out a new pair.
  describe("getLiveUser", () => {
    it("returns who the member is now, in the shape the guards read", async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 25,
        username: "walter",
        role: UserRole.USER,
      });

      await expect(service.getLiveUser(25)).resolves.toEqual({
        userId: 25,
        username: "walter",
        role: UserRole.USER,
      });
      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { id: 25 },
        select: { id: true, username: true, role: true },
      });
    });

    // findOne leaves soft-deleted rows out, so a closed account is null too.
    it("returns null when the account is closed or was never there", async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.getLiveUser(25)).resolves.toBeNull();
    });
  });

  // GET /users/:id. The answer carries the email and the role, so only that
  // user and an admin may read it.
  describe("getUserForCaller", () => {
    const storedUser = { id: 4, username: "walter", email: "w@x.com", role: UserRole.USER };

    const walter: AuthUser = { userId: 4, username: "walter", role: UserRole.USER };
    const donny: AuthUser = { userId: 5, username: "donny", role: UserRole.USER };
    const admin: AuthUser = { userId: 1, username: "admin", role: UserRole.ADMIN };

    it("returns a user to that user", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);

      const result = await service.getUserForCaller(4, walter);

      expect(result).toMatchObject({ id: 4, email: "w@x.com", role: UserRole.USER });
    });

    it("returns any user to an admin", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);

      const result = await service.getUserForCaller(4, admin);

      expect(result).toMatchObject({ id: 4, email: "w@x.com", role: UserRole.USER });
    });

    it("throws 403 NOT_OWNER when a member asks for another member", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);

      const attempt = service.getUserForCaller(4, donny);

      await expect(attempt).rejects.toBeInstanceOf(NotOwnerException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "NOT_OWNER" });
    });

    // The caller's own role decides, not the role of the user being read:
    // a member may not read an admin's record either.
    it("throws 403 when a member asks for an admin", async () => {
      usersRepository.findOne.mockResolvedValue({ ...storedUser, id: 1, role: UserRole.ADMIN });

      await expect(service.getUserForCaller(1, donny)).rejects.toBeInstanceOf(NotOwnerException);
    });

    // 404 before 403, as everywhere else NotOwnerException is thrown: a
    // missing user is "not found" for every caller.
    it.each([
      ["a member who would not own it", donny],
      ["an admin", admin],
    ])("throws 404 for a missing user, asked for by %s", async (_who, caller) => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserForCaller(999, caller)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // For the dev token command. It reads an identifier the way login does,
  // through the same private finder, and asks for no password.
  describe("getUserByIdentifier", () => {
    const storedUser = {
      id: 4,
      username: "walter",
      email: "w@x.com",
      password: "hashed(secret1)",
      role: "user",
    };

    it("searches the email column when the identifier has an @", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);

      const result = await service.getUserByIdentifier("w@x.com");

      // No withDeleted, so a soft-deleted user is not found.
      expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { email: "w@x.com" } });
      expect(result).toMatchObject({ id: 4, username: "walter", role: "user" });
    });

    it("searches the username column when it has none", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);

      await service.getUserByIdentifier("walter");

      expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { username: "walter" } });
    });

    it("returns the user without the password, and never runs the hasher", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);

      const result = await service.getUserByIdentifier("walter");

      expect(result?.password).toBeUndefined();
      expect(hashingProvider.comparePassword).not.toHaveBeenCalled();
    });

    it("returns null when nobody has the identifier", async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserByIdentifier("nobody")).resolves.toBeNull();
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
      hashingProvider.comparePassword.mockResolvedValue(true);

      const result = await service.getUserByCredentials("w@x.com", "secret1");

      // An "@" means an email, so the email column is searched and no other.
      // No withDeleted, so a soft-deleted user is not found and can't log in.
      expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { email: "w@x.com" } });
      // The typed password first, the stored hash second.
      expect(hashingProvider.comparePassword).toHaveBeenCalledWith("secret1", "hashed(secret1)");
      expect(result?.user).toMatchObject({ id: 4, username: "walter" });
      expect(result?.user.password).toBeUndefined();
      // The hash that was checked comes back beside the member, for
      // credentialsStillHold. It is not part of the member.
      expect(result?.passwordHash).toBe("hashed(secret1)");
    });

    it("searches by username when the identifier has no @", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      hashingProvider.comparePassword.mockResolvedValue(true);

      const result = await service.getUserByCredentials("walter", "secret1");

      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
      expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { username: "walter" } });
      expect(result?.user).toMatchObject({ id: 4, username: "walter" });
    });

    // The casing is passed on as typed. The columns are citext, so Postgres
    // is what ignores it; test/login.e2e-spec.ts proves that part.
    it("passes the identifier to the query with its casing as typed", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      hashingProvider.comparePassword.mockResolvedValue(true);

      await service.getUserByCredentials("Walter", "secret1");
      await service.getUserByCredentials("W@X.com", "secret1");

      expect(usersRepository.findOne).toHaveBeenNthCalledWith(1, { where: { username: "Walter" } });
      expect(usersRepository.findOne).toHaveBeenNthCalledWith(2, { where: { email: "W@X.com" } });
    });

    it("returns null when the hasher says the password is wrong", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      hashingProvider.comparePassword.mockResolvedValue(false);

      await expect(service.getUserByCredentials("w@x.com", "wrong-one")).resolves.toBeNull();
    });

    // The compare still runs, against no hash, so an unknown email or
    // username takes as long to reject as a wrong password.
    it.each(["no@x.com", "nobody"])(
      "returns null when no user matches %s, and still runs the compare",
      async (identifier) => {
        usersRepository.findOne.mockResolvedValue(null);
        hashingProvider.comparePassword.mockResolvedValue(false);

        await expect(service.getUserByCredentials(identifier, "secret1")).resolves.toBeNull();
        expect(hashingProvider.comparePassword).toHaveBeenCalledWith("secret1", undefined);
      },
    );
  });

  // What sign-in asks straight after it has started a session: is the
  // password that was checked still the member's password?
  describe("credentialsStillHold", () => {
    it("is true when the live user still has that hash", async () => {
      manager.findOne.mockResolvedValue({ id: 4 });

      await expect(service.credentialsStillHold(4, "hashed(secret1)")).resolves.toBe(true);
    });

    // The password was changed, or the account closed, while the old
    // password was being checked. findOne leaves soft-deleted rows out.
    it("is false when no live user has that hash any more", async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.credentialsStillHold(4, "hashed(secret1)")).resolves.toBe(false);
    });

    // FOR SHARE makes the read wait for a password change that is in flight,
    // so it cannot see the old hash a moment before the commit. A lock needs
    // a transaction.
    it("reads the row with a share lock, inside a transaction", async () => {
      manager.findOne.mockResolvedValue({ id: 4 });

      await service.credentialsStillHold(4, "hashed(secret1)");

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(User, {
        where: { id: 4, password: "hashed(secret1)" },
        select: { id: true },
        lock: { mode: "pessimistic_read" },
      });
    });
  });

  describe("createUser", () => {
    // Sign up needs a profile with a display name. Most tests here are about
    // the user, so they share this one.
    const profile = { displayName: "The Dude" };

    it("creates the user and the profile using the SAME transaction manager", async () => {
      // By `SAME transaction manager` we mean the user insert and the profile
      // insert both run through the `manager` the transaction hands us, so they
      // commit or roll back together.
      const mockUserId = 42;
      const mockProfile = { id: 1, userId: mockUserId, displayName: "The Dude", isDude: true };
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: mockUserId, username: "dude", email: "d@x.com" });
      profilesService.createProfileForUser.mockResolvedValue(mockProfile);

      const result = await service.createUser({
        username: "dude",
        email: "d@x.com",
        password: "secret1",
        profile: { displayName: "The Dude", bio: "abides" },
      });

      // Both writes happen inside one transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // The user is saved through the transaction's manager, not the repository.
      // The hash is what gets stored, never the password itself.
      expect(hashingProvider.hashPassword).toHaveBeenCalledWith("secret1");
      expect(manager.save).toHaveBeenCalledWith(User, {
        username: "dude",
        email: "d@x.com",
        password: "hashed(secret1)",
      });
      // The profile is created with that same manager, for the id the insert returned.
      expect(profilesService.createProfileForUser).toHaveBeenCalledWith(manager, mockUserId, {
        displayName: "The Dude",
        bio: "abides",
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
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toThrow("profile insert failed");
    });

    it("throws 409 and creates nothing when the email is taken", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "d@x.com", username: "someoneelse" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toMatchObject({ message: "Email already registered", errorCode: "EMAIL_TAKEN" });

      expect(manager.save).not.toHaveBeenCalled();
      expect(profilesService.createProfileForUser).not.toHaveBeenCalled();
    });

    it("throws 409 when the username is taken", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "other@x.com", username: "dude" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toMatchObject({ message: "Username already taken", errorCode: "USERNAME_TAKEN" });

      expect(manager.save).not.toHaveBeenCalled();
    });

    // The columns ignore case, so the lookup returns a row whose casing
    // differs from what was sent. The 409 still has to name the right field.
    it("names the email when it is taken in a different casing", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "d@x.com", username: "someoneelse" });

      await expect(
        service.createUser({ username: "dude", email: "D@X.com", password: "secret1", profile }),
      ).rejects.toMatchObject({ errorCode: "EMAIL_TAKEN" });
    });

    it("names the username when it is taken in a different casing", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "other@x.com", username: "dude" });

      await expect(
        service.createUser({ username: "Dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toMatchObject({ errorCode: "USERNAME_TAKEN" });
    });

    // The unique indexes on email and username still cover soft-deleted rows,
    // so the conflict lookup has to see them or the insert fails as a 500.
    it("searches soft-deleted rows for both email and username", async () => {
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: 7, username: "dude", email: "d@x.com" });
      profilesService.createProfileForUser.mockResolvedValue({ id: 1, userId: 7 });

      await service.createUser({
        username: "dude",
        email: "d@x.com",
        password: "secret1",
        profile,
      });

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
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toBeInstanceOf(ValueTakenException);

      expect(manager.save).not.toHaveBeenCalled();
    });

    // The display name is unique as well, on the profile table, so its check
    // belongs to ProfilesService. It has to run inside the transaction, and
    // before the slow hash and the first write.
    it("checks the display name through the transaction's manager, before hashing", async () => {
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: 7, username: "dude", email: "d@x.com" });
      profilesService.createProfileForUser.mockResolvedValue({ id: 1, userId: 7 });

      await service.createUser({
        username: "dude",
        email: "d@x.com",
        password: "secret1",
        profile,
      });

      expect(profilesService.assertDisplayNameFree).toHaveBeenCalledWith(manager, "The Dude");
      expect(profilesService.assertDisplayNameFree.mock.invocationCallOrder[0]).toBeLessThan(
        hashingProvider.hashPassword.mock.invocationCallOrder[0],
      );
    });

    it("throws 409 and creates nothing when the display name is taken", async () => {
      manager.findOne.mockResolvedValue(null);
      profilesService.assertDisplayNameFree.mockRejectedValue(
        new ValueTakenException("displayName"),
      );

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toMatchObject({
        message: "Display name already taken",
        errorCode: "DISPLAY_NAME_TAKEN",
      });

      expect(hashingProvider.hashPassword).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(profilesService.createProfileForUser).not.toHaveBeenCalled();
    });

    // One answer at a time, and the account fields first: a caller told
    // "email taken" is not also told about the name.
    it("does not check the display name when the email is already taken", async () => {
      manager.findOne.mockResolvedValue({ id: 1, email: "d@x.com", username: "someoneelse" });

      await expect(
        service.createUser({ username: "dude", email: "d@x.com", password: "secret1", profile }),
      ).rejects.toMatchObject({ errorCode: "EMAIL_TAKEN" });

      expect(profilesService.assertDisplayNameFree).not.toHaveBeenCalled();
    });
  });

  describe("updateMyUser", () => {
    const storedUser = { id: 3, username: "dude", email: "d@x.com", password: "hashed(secret1)" };

    it("sets a new password when the current one is right", async () => {
      usersRepository.findOne.mockResolvedValue(storedUser);
      manager.update.mockResolvedValue({ affected: 1 });
      hashingProvider.comparePassword.mockResolvedValue(true);

      await service.updateMyUser(3, { password: "secret2", currentPassword: "secret1" });

      expect(hashingProvider.comparePassword).toHaveBeenCalledWith("secret1", "hashed(secret1)");
      // currentPassword is not a column, so it must not reach the update.
      expect(manager.update).toHaveBeenCalledWith(
        User,
        { id: 3, deletedAt: IsNull() },
        { password: "hashed(secret2)", passwordChangedAt: expect.any(String) },
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
      hashingProvider.comparePassword.mockResolvedValue(false);

      const attempt = service.updateMyUser(3, { password: "secret2", currentPassword: "not-it" });

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "WRONG_PASSWORD" });
      expect(hashingProvider.hashPassword).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("does not ask for the current password when no new one is set", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 3, username: "donny", email: "d@x.com" });

      await service.updateMyUser(3, { username: "donny" });

      expect(hashingProvider.comparePassword).not.toHaveBeenCalled();
      expect(usersRepository.update).toHaveBeenCalledWith(expect.anything(), { username: "donny" });
    });
  });

  describe("updateUser", () => {
    // update() does not apply the soft-delete filter that find() does, so the
    // criteria has to carry it or a deleted row gets mutated behind a 404.
    it("scopes the update to rows that are not soft-deleted", async () => {
      manager.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue({
        id: 3,
        username: "dude",
        email: "dude@example.com",
        role: "user",
      });

      await service.updateUser(3, { password: "secret2" });

      expect(manager.update).toHaveBeenCalledWith(
        User,
        { id: 3, deletedAt: IsNull() },
        {
          password: "hashed(secret2)",
          passwordChangedAt: expect.any(String),
        },
      );
    });

    it("stores a new password as a hash", async () => {
      manager.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue({ id: 3, username: "dude" });

      await service.updateUser(3, { password: "secret2" });

      expect(hashingProvider.hashPassword).toHaveBeenCalledWith("secret2");
      expect(manager.update).toHaveBeenCalledWith(User, expect.anything(), {
        password: "hashed(secret2)",
        passwordChangedAt: expect.any(String),
      });
    });

    // The stamp is what ends the access tokens signed with the old password.
    // See getUserForToken.
    it("stamps passwordChangedAt with the current UTC time when a password is set", async () => {
      manager.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue({ id: 3, username: "dude" });

      await service.updateUser(3, { password: "secret2" });

      const [, , written] = manager.update.mock.calls[0] as [
        unknown,
        unknown,
        Record<string, string>,
      ];
      expect(isValidUtc(written.passwordChangedAt)).toBe(true);
    });

    // Whoever was signed in with the old password signs in again with the
    // new one: the member on another device, or someone who should not be
    // there at all.
    describe("a new password ends the member's sessions", () => {
      beforeEach(() => {
        usersRepository.findOne.mockResolvedValue({ id: 3, username: "dude" });
      });

      // One transaction for the two writes, through the same manager. If
      // they were separate and the second failed, the old refresh tokens
      // would outlive the password they were issued under.
      it("stores the password and ends the sessions in one transaction", async () => {
        manager.update.mockResolvedValue({ affected: 1 });

        await service.updateUser(3, { password: "secret2" });

        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(3, expect.any(String), manager);
        // The password write does not go round the transaction.
        expect(usersRepository.update).not.toHaveBeenCalled();
      });

      // The user row first. That holds a lock on it until the commit, which
      // credentialsStillHold waits on.
      it("writes the user row before it ends the sessions", async () => {
        manager.update.mockResolvedValue({ affected: 1 });

        await service.updateUser(3, { password: "secret2" });

        expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(
          refreshTokens.revokeAllForUser.mock.invocationCallOrder[0],
        );
      });

      // The error has to escape the transaction callback: that is what tells
      // TypeORM to undo the password. The caller gets the failure and tries
      // again, with nothing half done.
      it("rejects when ending the sessions fails, so the password rolls back", async () => {
        manager.update.mockResolvedValue({ affected: 1 });
        const failure = new Error("connection lost");
        refreshTokens.revokeAllForUser.mockRejectedValueOnce(failure);

        await expect(service.updateUser(3, { password: "secret2" })).rejects.toBe(failure);
      });

      it("ends no session when the user is not found", async () => {
        manager.update.mockResolvedValue({ affected: 0 });

        await expect(service.updateUser(3, { password: "secret2" })).rejects.toBeInstanceOf(
          NotFoundException,
        );

        expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
      });
    });

    it("ends no session when the body has no password", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 3, username: "donny", email: "donny@example.com" });

      await service.updateUser(3, { username: "donny" });

      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
      // No second write to keep in step with, so no transaction either.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    // Changing a username must not sign anybody out.
    it("leaves passwordChangedAt alone when the body has no password", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 3, username: "donny", email: "donny@example.com" });

      await service.updateUser(3, { username: "donny" });

      expect(usersRepository.update).toHaveBeenCalledWith(expect.anything(), { username: "donny" });
    });

    it("does not hash anything when the body has no password", async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 });
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 3, username: "donny", email: "d@x.com" });

      await service.updateUser(3, { username: "donny" });

      expect(hashingProvider.hashPassword).not.toHaveBeenCalled();
      expect(usersRepository.update).toHaveBeenCalledWith(expect.anything(), { username: "donny" });
    });

    it("throws 400 when the body carries no user fields", async () => {
      await expect(service.updateUser(3, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    // The path with no password, which writes outside a transaction. The
    // path with one is covered above, under "a new password ends the
    // member's sessions".
    it("throws 404 when the user is already soft-deleted", async () => {
      usersRepository.findOne.mockResolvedValueOnce(null);
      usersRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.updateUser(3, { username: "donny" })).rejects.toBeInstanceOf(
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
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    // A closed account has no sessions. Through the same manager, so the
    // account cannot be closed with its sessions left alive.
    it("ends every session of the member in the same transaction", async () => {
      manager.softDelete.mockResolvedValue({ affected: 1 });

      await service.deleteUser(3);

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(3, expect.any(String), manager);
    });

    // Mongo stays last: it is outside the transaction and cannot be rolled
    // back, so everything that can fail in Postgres goes before it.
    it("ends the sessions before it touches the abidings", async () => {
      manager.softDelete.mockResolvedValue({ affected: 1 });

      await service.deleteUser(3);

      expect(refreshTokens.revokeAllForUser.mock.invocationCallOrder[0]).toBeLessThan(
        userAbidingsService.softDeleteForUser.mock.invocationCallOrder[0],
      );
    });

    it("rejects when ending the sessions fails, and leaves the abidings alone", async () => {
      manager.softDelete.mockResolvedValue({ affected: 1 });
      const failure = new Error("connection lost");
      refreshTokens.revokeAllForUser.mockRejectedValueOnce(failure);

      await expect(service.deleteUser(3)).rejects.toBe(failure);

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

    // Nobody is signed in to a restored account until they sign in to it.
    it("ends every session of the member, in the same transaction", async () => {
      manager.restore.mockResolvedValue({ affected: 1 });
      usersRepository.findOne.mockResolvedValue({ id: 3, username: "dude" });

      await service.restoreUser(3);

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(3, expect.any(String), manager);
      expect(refreshTokens.revokeAllForUser.mock.invocationCallOrder[0]).toBeLessThan(
        userAbidingsService.restoreForUser.mock.invocationCallOrder[0],
      );
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
