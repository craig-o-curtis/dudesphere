import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { HashingProvider } from "../hashing/hashing.provider.js";
import { User, UserRole } from "./user.entity.js";
import { UsersSeedService } from "./users.seed.js";

describe("UsersSeedService", () => {
  let seedService: UsersSeedService;

  const usersRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const hashingProvider = { hash: vi.fn(), compare: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    usersRepository.create.mockImplementation((values: object) => values);
    hashingProvider.hash.mockImplementation((plain: string) => Promise.resolve(`hashed(${plain})`));

    const module = await Test.createTestingModule({
      providers: [
        UsersSeedService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: HashingProvider, useValue: hashingProvider },
      ],
    }).compile();

    seedService = module.get(UsersSeedService);
  });

  it("creates the admin with a hashed password when there is none", async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await seedService.seed("admin@dude.com", "rug-password");

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@dude.com",
        role: UserRole.ADMIN,
        password: "hashed(rug-password)",
      }),
    );
  });

  // A re-run resets the admin's password to the value in .env, as a hash.
  it("stores a hash, not the password, when it updates an existing admin", async () => {
    const existing = { id: 1, email: "admin@dude.com", password: "old-plain-text", role: "user" };
    usersRepository.findOne.mockResolvedValue(existing);

    await seedService.seed("admin@dude.com", "rug-password");

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, role: UserRole.ADMIN, password: "hashed(rug-password)" }),
    );
  });

  it("does nothing when the email or the password is not set", async () => {
    await seedService.seed("admin@dude.com", "");

    expect(hashingProvider.hash).not.toHaveBeenCalled();
    expect(usersRepository.save).not.toHaveBeenCalled();
  });
});
