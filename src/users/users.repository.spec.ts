import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { IsNull } from "typeorm";

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
      providers: [UsersRepository, { provide: getRepositoryToken(User), useValue: users }],
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

      await repository.updatePasswordHash(4, "$scrypt$new");

      expect(users.update).toHaveBeenCalledWith({ id: 4, deletedAt: IsNull() }, expect.anything());
    });

    // A rehash at sign-in: the same password, stored with a newer hash. The
    // member's access tokens must keep working, so the stamp is left alone.
    it("stores only the hash when no time is given", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await repository.updatePasswordHash(4, "$scrypt$new");

      expect(users.update).toHaveBeenCalledWith(expect.anything(), { password: "$scrypt$new" });
    });

    // A new password: the stamp ends every access token signed before it.
    it("stamps passwordChangedAt when a time is given", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await repository.updatePasswordHash(4, "$scrypt$new", "2026-10-14T09:00:00.000Z");

      expect(users.update).toHaveBeenCalledWith(expect.anything(), {
        password: "$scrypt$new",
        passwordChangedAt: "2026-10-14T09:00:00.000Z",
      });
    });

    it("resolves true when it wrote the row", async () => {
      users.update.mockResolvedValue({ affected: 1 });

      await expect(repository.updatePasswordHash(4, "$scrypt$new")).resolves.toBe(true);
    });

    // The member is gone, or was closed while the hash was being made.
    it("resolves false when no live row matched", async () => {
      users.update.mockResolvedValue({ affected: 0 });

      await expect(repository.updatePasswordHash(4, "$scrypt$new")).resolves.toBe(false);
    });
  });
});
