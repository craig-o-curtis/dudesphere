import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, IsNull } from "typeorm";

import { User, UserRole } from "./user.entity.js";
import { UsersRepository } from "./users.repository.js";

// These cases check what each method asks TypeORM for, and what it does with
// the answer. The SQL itself, and that citext ignores case, are proved
// against the real database in the e2e tests.
describe("UsersRepository", () => {
  let repository: UsersRepository;

  const users = {
    findOne: vi.fn(),
    update: vi.fn(),
  };

  // The repository a caller's transaction hands out, kept apart from `users`
  // so a test can tell which one was written through.
  const managerUsers = {
    update: vi.fn(),
  };

  // A fake EntityManager: what a transaction callback receives.
  const manager = {
    findOne: vi.fn(),
    getRepository: vi.fn(() => managerUsers),
  };

  // A fake DataSource whose transaction() just runs the callback with our fake manager.
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) => callback(manager)),
  };

  // A row as TypeORM returns it when nothing is left out of the select:
  // the password hash included.
  const storedUser = {
    id: 4,
    username: "walter",
    email: "walter@example.com",
    password: "$scrypt$ln=17,r=8,p=1$c2FsdA$aGFzaA",
    role: UserRole.USER,
    passwordChangedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repository = module.get(UsersRepository);
  });

  // What a find without the hash selects: every column the guards and the
  // handlers read, and not the password.
  function selectOf(callIndex = 0): Record<string, boolean> {
    const [options] = users.findOne.mock.calls[callIndex] as [{ select: Record<string, boolean> }];
    return options.select;
  }

  describe("findById", () => {
    it("finds the member by id", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findById(4);

      expect(users.findOne).toHaveBeenCalledWith({ where: { id: 4 }, select: expect.any(Object) });
    });

    // This is what JwtAuth loads on every signed-in request, and it ends up
    // on request.user. The hash must not ride along.
    it("never selects the password", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findById(4);

      expect(selectOf()).not.toHaveProperty("password");
      expect(selectOf()).toMatchObject({ id: true, role: true, passwordChangedAt: true });
    });

    it("returns null when there is no such member", async () => {
      users.findOne.mockResolvedValue(null);

      await expect(repository.findById(2_000_000_000)).resolves.toBeNull();
    });
  });

  describe("findByIdentifier", () => {
    it("searches the email column when the identifier has an @", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findByIdentifier("walter@example.com");

      expect(users.findOne).toHaveBeenCalledWith({
        where: { email: "walter@example.com" },
        select: expect.any(Object),
      });
    });

    it("searches the username column when it has none", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findByIdentifier("walter");

      expect(users.findOne).toHaveBeenCalledWith({
        where: { username: "walter" },
        select: expect.any(Object),
      });
    });

    it("never selects the password", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findByIdentifier("walter");

      expect(selectOf()).not.toHaveProperty("password");
    });
  });

  describe("findCredentials", () => {
    // No withDeleted, so a soft-deleted member is not found and can't sign in.
    it("searches by email or by username, the same way as findByIdentifier", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findCredentials("walter@example.com");
      await repository.findCredentials("walter");

      expect(users.findOne).toHaveBeenNthCalledWith(1, { where: { email: "walter@example.com" } });
      expect(users.findOne).toHaveBeenNthCalledWith(2, { where: { username: "walter" } });
    });

    // The casing is passed on as typed. The columns are citext, so Postgres
    // is what ignores it.
    it("passes the identifier on with its casing as typed", async () => {
      users.findOne.mockResolvedValue(null);

      await repository.findCredentials("Walter@Example.com");

      expect(users.findOne).toHaveBeenCalledWith({ where: { email: "Walter@Example.com" } });
    });

    // The hash comes back beside the member, not inside it, so whatever is
    // done with the member later cannot leak the hash.
    it("hands back the hash apart from the member", async () => {
      users.findOne.mockResolvedValue({ ...storedUser });

      const result = await repository.findCredentials("walter");

      expect(result?.passwordHash).toBe(storedUser.password);
      expect(result?.user).toMatchObject({ id: 4, username: "walter", role: UserRole.USER });
      expect(result?.user).not.toHaveProperty("password");
    });

    it("returns null when nobody has the identifier", async () => {
      users.findOne.mockResolvedValue(null);

      await expect(repository.findCredentials("nobody")).resolves.toBeNull();
    });
  });

  describe("updatePasswordHash", () => {
    // update() does not apply the soft-delete filter that find() does, so
    // the criteria has to carry it, or a closed account gets a new hash.
    it("writes to live rows only", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await repository.updatePasswordHash(4, "$scrypt$new", "2026-10-14T09:00:00.000Z");

      expect(users.update).toHaveBeenCalledWith({ id: 4, deletedAt: IsNull() }, expect.anything());
    });

    // A new password: the stamp ends every access token signed before it.
    it("stamps passwordChangedAt with the hash", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await repository.updatePasswordHash(4, "$scrypt$new", "2026-10-14T09:00:00.000Z");

      expect(users.update).toHaveBeenCalledWith(expect.anything(), {
        password: "$scrypt$new",
        passwordChangedAt: "2026-10-14T09:00:00.000Z",
      });
    });

    it("resolves true when it wrote the row", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await expect(
        repository.updatePasswordHash(4, "$scrypt$new", "2026-10-14T09:00:00.000Z"),
      ).resolves.toBe(true);
    });

    // The member is gone, or was closed while the hash was being made.
    it("resolves false when no live row matched", async () => {
      users.update.mockResolvedValue({ affected: 0 });

      await expect(
        repository.updatePasswordHash(4, "$scrypt$new", "2026-10-14T09:00:00.000Z"),
      ).resolves.toBe(false);
    });

    // A password reset stores the hash and ends the sign-ins in one
    // transaction. The write has to go through that transaction's manager,
    // or it would commit on its own.
    it("writes through the manager's repository when given a manager", async () => {
      managerUsers.update.mockResolvedValue({ affected: 1 });

      await expect(
        repository.updatePasswordHash(
          4,
          "$scrypt$new",
          "2026-10-14T09:00:00.000Z",
          manager as never,
        ),
      ).resolves.toBe(true);

      expect(manager.getRepository).toHaveBeenCalledWith(User);
      expect(managerUsers.update).toHaveBeenCalledWith(
        { id: 4, deletedAt: IsNull() },
        { password: "$scrypt$new", passwordChangedAt: "2026-10-14T09:00:00.000Z" },
      );
      expect(users.update).not.toHaveBeenCalled();
    });
  });

  describe("signInStillValid", () => {
    // The share lock makes this read wait for a password change that is in
    // flight, and then see its new stamp. A lock needs a transaction.
    it("reads the stamp inside a transaction, with a share lock", async () => {
      manager.findOne.mockResolvedValue({ id: 4, passwordChangedAt: null });

      await repository.signInStillValid(4, null);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(User, {
        where: { id: 4 },
        select: { id: true, passwordChangedAt: true },
        lock: { mode: "pessimistic_read" },
      });
    });

    it("returns true when the stamp is the one read at the password check", async () => {
      manager.findOne.mockResolvedValue({ id: 4, passwordChangedAt: "2026-10-14T09:00:00.000Z" });

      await expect(repository.signInStillValid(4, "2026-10-14T09:00:00.000Z")).resolves.toBe(true);
    });

    // A member who has never changed their password has no stamp at all.
    it("returns true when the stamp was empty and still is", async () => {
      manager.findOne.mockResolvedValue({ id: 4, passwordChangedAt: null });

      await expect(repository.signInStillValid(4, null)).resolves.toBe(true);
    });

    // The password changed while it was being checked. The new sign-in
    // would outlive that change, so it must be ended.
    it("returns false when the stamp has changed", async () => {
      manager.findOne.mockResolvedValue({ id: 4, passwordChangedAt: "2026-10-14T09:00:01.000Z" });

      await expect(repository.signInStillValid(4, "2026-10-14T09:00:00.000Z")).resolves.toBe(false);
    });

    it("returns false when a first password was set in the meantime", async () => {
      manager.findOne.mockResolvedValue({ id: 4, passwordChangedAt: "2026-10-14T09:00:00.000Z" });

      await expect(repository.signInStillValid(4, null)).resolves.toBe(false);
    });

    // The account was closed in the meantime. The find leaves soft-deleted
    // rows out, so there is no row.
    it("returns false when there is no live row", async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(repository.signInStillValid(4, null)).resolves.toBe(false);
    });
  });

  describe("replacePasswordHash", () => {
    // Only while the old hash is still stored, so a password change that
    // landed in the meantime is never overwritten with the old password.
    it("writes only to a live row that still has the old hash", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await repository.replacePasswordHash(4, "$2b$04$old", "$scrypt$new");

      expect(users.update).toHaveBeenCalledWith(
        { id: 4, password: "$2b$04$old", deletedAt: IsNull() },
        { password: "$scrypt$new" },
      );
    });

    // The same password, so the stamp is left alone and no token ends.
    it("leaves passwordChangedAt alone", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await repository.replacePasswordHash(4, "$2b$04$old", "$scrypt$new");

      expect(users.update.mock.calls[0][1]).not.toHaveProperty("passwordChangedAt");
    });

    it("resolves false when the hash changed in the meantime", async () => {
      users.update.mockResolvedValue({ affected: 0 });

      await expect(repository.replacePasswordHash(4, "$2b$04$old", "$scrypt$new")).resolves.toBe(
        false,
      );
    });
  });
});
