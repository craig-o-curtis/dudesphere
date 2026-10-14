import { Test, TestingModule } from "@nestjs/testing";

import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import { UsersService } from "../users/users.service.js";
import { AuthController } from "./auth.controller.js";

// Pipes, guards and status codes only run on a real HTTP request, so they
// belong in e2e tests. These check what the handler hands on and returns.
describe("AuthController", () => {
  let controller: AuthController;

  const usersService = { createUser: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe("signUp", () => {
    const body = {
      username: "walter",
      email: "walter@example.com",
      password: "secret1",
      profile: { displayName: "Walter Sobchak" },
    };

    it("creates the member through UsersService and answers with what it returns", async () => {
      const created = { id: 25, username: "walter", email: "walter@example.com" };
      usersService.createUser.mockResolvedValue(created);

      await expect(controller.signUp(body)).resolves.toBe(created);

      expect(usersService.createUser).toHaveBeenCalledTimes(1);
      expect(usersService.createUser).toHaveBeenCalledWith(body);
    });

    // UsersService owns the duplicate check. Sign-up must not catch its 409
    // and turn it into something else.
    it("lets the 409 through when the email or username is taken", async () => {
      const taken = new ValueTakenException("email");
      usersService.createUser.mockRejectedValue(taken);

      await expect(controller.signUp(body)).rejects.toBe(taken);
    });
  });
});
