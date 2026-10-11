import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { ValueTakenException } from "../shared/exceptions/value-taken.exception.js";
import { UsersService } from "../users/users.service.js";
import { AuthService } from "./auth.service.js";
import { TokenService } from "./token.service.js";

describe("AuthService", () => {
  let service: AuthService;

  const usersService = {
    createUser: vi.fn(),
    getUserByCredentials: vi.fn(),
    credentialsStillHold: vi.fn(),
  };
  const tokenService = { issue: vi.fn(), revoke: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe("signup", () => {
    const signupDto = {
      username: "walter",
      email: "w@x.com",
      password: "secret1",
      profile: { displayName: "Walter Sobchak" },
    };

    it("creates the user through UsersService and returns what it returns", async () => {
      const created = { id: 25, username: "walter", email: "w@x.com", role: "user" };
      usersService.createUser.mockResolvedValue(created);

      const result = await service.signup(signupDto);

      expect(usersService.createUser).toHaveBeenCalledTimes(1);
      expect(usersService.createUser).toHaveBeenCalledWith(signupDto);
      expect(result).toBe(created);
    });

    it("passes the whole profile along, not only its display name", async () => {
      const withProfile = {
        ...signupDto,
        profile: { displayName: "Walter Sobchak", bio: "The Dude abides" },
      };
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
  });

  describe("signIn", () => {
    const walter = { id: 25, username: "walter", role: "user" };
    const checked = { user: walter, passwordHash: "hashed(secret1)" };
    const pair = { accessToken: "a.b.c", refreshToken: "r".repeat(43), expiresIn: 900 };

    beforeEach(() => {
      usersService.getUserByCredentials.mockResolvedValue(checked);
      usersService.credentialsStillHold.mockResolvedValue(true);
      tokenService.issue.mockResolvedValue(pair);
    });

    it("checks the credentials, starts a session and returns its tokens", async () => {
      const result = await service.signIn({
        identifier: "walter@example.com",
        password: "secret1",
      });

      expect(usersService.getUserByCredentials).toHaveBeenCalledWith(
        "walter@example.com",
        "secret1",
      );
      expect(tokenService.issue).toHaveBeenCalledWith(walter);
      expect(result).toBe(pair);
    });

    // Which column to search is UsersService's choice. AuthService hands the
    // identifier over as it came.
    it("passes a username on in the same way as an email", async () => {
      await service.signIn({ identifier: "walter", password: "secret1" });

      expect(usersService.getUserByCredentials).toHaveBeenCalledWith("walter", "secret1");
    });

    it("throws 401 and starts no session when the identifier or password is wrong", async () => {
      usersService.getUserByCredentials.mockResolvedValue(null);

      const attempt = service.signIn({ identifier: "walter@example.com", password: "wrong-one" });

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      // One message whatever was wrong, so it names no field.
      await expect(attempt).rejects.toMatchObject({
        message: "Invalid username, email or password",
        errorCode: "BAD_CREDENTIALS",
      });
      expect(tokenService.issue).not.toHaveBeenCalled();
    });

    // Checking a password takes about a tenth of a second. If the password
    // is changed, or the account closed, inside that time, the change ends
    // the member's sessions before this one exists. So sign-in asks again
    // once it has the session.
    describe("when the password changed while the old one was being checked", () => {
      it("asks again after the session is started, with the hash that was checked", async () => {
        await service.signIn({ identifier: "walter", password: "secret1" });

        expect(usersService.credentialsStillHold).toHaveBeenCalledWith(25, "hashed(secret1)");
        expect(usersService.credentialsStillHold.mock.invocationCallOrder[0]).toBeGreaterThan(
          tokenService.issue.mock.invocationCallOrder[0],
        );
        expect(tokenService.revoke).not.toHaveBeenCalled();
      });

      it("ends the session it just started, and answers as for a wrong password", async () => {
        usersService.credentialsStillHold.mockResolvedValue(false);

        const attempt = service.signIn({ identifier: "walter", password: "secret1" });

        await expect(attempt).rejects.toMatchObject({
          message: "Invalid username, email or password",
          errorCode: "BAD_CREDENTIALS",
        });
        expect(tokenService.revoke).toHaveBeenCalledWith(pair.refreshToken);
      });
    });

    // The hash is for credentialsStillHold and nothing else.
    it("returns the tokens only, with no trace of the stored hash", async () => {
      const result = await service.signIn({ identifier: "walter", password: "secret1" });

      expect(JSON.stringify(result)).not.toContain("hashed(secret1)");
    });
  });
});
