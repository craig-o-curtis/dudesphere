import { PasswordHasher } from "@nestjs/authentication";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { User, UserRole } from "./user.entity.js";
import { UsersSeedService } from "./users.seed.js";

describe("UsersSeedService", () => {
  let seedService: UsersSeedService;

  const usersRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  // A fake hasher, so the seed tests do not run scrypt. hash() wraps its
  // input, so a stored hash is easy to tell from the password.
  const passwordHasher = { hash: vi.fn(), verify: vi.fn(), needsRehash: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    usersRepository.create.mockImplementation((values: object) => values);
    // The real save() returns the row with the id the database gave it.
    usersRepository.save.mockImplementation((user: object) => Promise.resolve({ id: 7, ...user }));
    passwordHasher.hash.mockImplementation((plain: string) => Promise.resolve(`hashed(${plain})`));

    const module = await Test.createTestingModule({
      providers: [
        UsersSeedService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: PasswordHasher, useValue: passwordHasher },
      ],
    }).compile();

    seedService = module.get(UsersSeedService);
  });

  it("creates the admin with a hashed password when there is none", async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await seedService.seed("admin@example.com", "rug-password");

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@example.com",
        role: UserRole.ADMIN,
        password: "hashed(rug-password)",
      }),
    );
  });

  // A re-run resets the admin's password to the value in .env, as a hash.
  it("stores a hash, not the password, when it updates an existing admin", async () => {
    const existing = {
      id: 1,
      email: "admin@example.com",
      password: "old-plain-text",
      role: "user",
    };
    usersRepository.findOne.mockResolvedValue(existing);

    await seedService.seed("admin@example.com", "rug-password");

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, role: UserRole.ADMIN, password: "hashed(rug-password)" }),
    );
  });

  it("does nothing, and returns null, when the email or the password is not set", async () => {
    await expect(seedService.seed("admin@example.com", "")).resolves.toBeNull();

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  // The abiding seed writes its sample rows as this user, so it needs the id
  // the database really gave the admin, not an assumed 1.
  it("returns the id of the admin it created", async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(seedService.seed("admin@example.com", "rug-password")).resolves.toBe(7);
  });

  it("returns the id of the admin it updated", async () => {
    usersRepository.findOne.mockResolvedValue({ id: 42, email: "admin@example.com", role: "user" });

    await expect(seedService.seed("admin@example.com", "rug-password")).resolves.toBe(42);
  });
});
