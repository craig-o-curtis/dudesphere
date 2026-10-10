import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";

import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import { UsersService } from "../users/users.service.js";
import { AuthService } from "./auth.service.js";

describe("AuthService", () => {
  let service: AuthService;

  const usersService = { createUser: vi.fn(), getUserByCredentials: vi.fn() };
  const jwtService = { signAsync: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe("signup", () => {
    const signupDto = { username: "walter", email: "w@x.com", password: "secret1" };

    it("creates the user through UsersService and returns what it returns", async () => {
      const created = { id: 25, username: "walter", email: "w@x.com", role: "user" };
      usersService.createUser.mockResolvedValue(created);

      const result = await service.signup(signupDto);

      expect(usersService.createUser).toHaveBeenCalledTimes(1);
      expect(usersService.createUser).toHaveBeenCalledWith(signupDto);
      expect(result).toBe(created);
    });

    it("passes the profile along when the caller sends one", async () => {
      const withProfile = { ...signupDto, profile: { bio: "The Dude abides" } };
      usersService.createUser.mockResolvedValue({ id: 25 });

      await service.signup(withProfile);

      expect(usersService.createUser).toHaveBeenCalledWith(withProfile);
    });

    // UsersService owns the duplicate check. Signup must not catch its 409
    // and turn it into something else.
    it("lets the 409 through when the email or username is taken", async () => {
      const taken = new ValueTakenException("email");
      usersService.createUser.mockRejectedValue(taken);

      await expect(service.signup(signupDto)).rejects.toBe(taken);
    });

    it("signs no token", async () => {
      usersService.createUser.mockResolvedValue({ id: 25 });

      await service.signup(signupDto);

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("signs a token that carries the user's own id", async () => {
      usersService.getUserByCredentials.mockResolvedValue({
        id: 25,
        username: "walter",
        role: "user",
      });
      jwtService.signAsync.mockResolvedValue("signed.jwt.token");

      const result = await service.login({ email: "w@x.com", password: "secret1" });

      expect(usersService.getUserByCredentials).toHaveBeenCalledWith("w@x.com", "secret1");
      // `sub` is what JwtAuthGuard later reads back as the logged-in user.
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 25,
        username: "walter",
        role: "user",
      });
      expect(result).toEqual({ token: "signed.jwt.token", userId: 25, name: "walter" });
    });

    it("throws 401 and signs nothing when the email or password is wrong", async () => {
      usersService.getUserByCredentials.mockResolvedValue(null);

      const attempt = service.login({ email: "w@x.com", password: "wrong-one" });

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "BAD_CREDENTIALS" });

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
