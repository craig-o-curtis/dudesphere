import type { JwtService } from "@nestjs/jwt";

import { jwtPayloadFor } from "../auth/auth-user.js";
import { UserRole } from "../users/user.entity.js";
import type { UsersService } from "../users/users.service.js";
import { createDevToken, DEV_TOKEN_DAYS } from "./dev-token.js";

// createDevToken signs a token with no password asked, so most of these
// tests are about when it refuses.
describe("createDevToken", () => {
  const signAsync = vi.fn();
  const getUserByIdentifier = vi.fn();

  // Only the one method each that createDevToken calls.
  const jwtService = { signAsync } as unknown as JwtService;
  const usersService = { getUserByIdentifier } as unknown as UsersService;

  // Made-up people. Nothing here is a real account: every address is at
  // example.com, which nobody can register.
  const admin = { id: 1, username: "maude", email: "admin@example.com", role: UserRole.ADMIN };
  const walter = { id: 25, username: "walter", email: "w@x.com", role: UserRole.USER };

  const development = { environment: "development", adminEmail: "admin@example.com" };

  beforeEach(() => {
    vi.resetAllMocks();
    signAsync.mockResolvedValue("a.b.c");
  });

  describe("who the token is for", () => {
    it("is the admin named by EMAIL when no identifier is given", async () => {
      getUserByIdentifier.mockResolvedValue(admin);

      const result = await createDevToken(jwtService, usersService, {
        ...development,
        identifier: undefined,
      });

      expect(getUserByIdentifier).toHaveBeenCalledWith("admin@example.com");
      expect(result).toEqual({ token: "a.b.c", user: admin });
    });

    it.each(["walter", "w@x.com"])("is the member named by %s", async (identifier) => {
      getUserByIdentifier.mockResolvedValue(walter);

      const result = await createDevToken(jwtService, usersService, {
        ...development,
        identifier,
      });

      // The identifier, not EMAIL. UsersService decides whether it is a
      // username or an email.
      expect(getUserByIdentifier).toHaveBeenCalledWith(identifier);
      expect(result.user).toBe(walter);
    });
  });

  describe("what is signed", () => {
    // The same claims login signs, built by the same function, so the guards
    // cannot tell a dev token from a login token.
    it("is the payload login would sign for that user", async () => {
      getUserByIdentifier.mockResolvedValue(walter);

      await createDevToken(jwtService, usersService, { ...development, identifier: "walter" });

      expect(signAsync).toHaveBeenCalledTimes(1);
      expect(signAsync.mock.calls[0][0]).toEqual(jwtPayloadFor(walter));
      expect(signAsync.mock.calls[0][0]).toEqual({
        sub: 25,
        username: "walter",
        role: UserRole.USER,
      });
    });

    // Only the lifetime is passed. The secret, the audience and the issuer
    // are left to the module's own options, which is what makes the token
    // one the app accepts. An option set here would replace the module's.
    it("passes the lifetime, in seconds, and no other option", async () => {
      getUserByIdentifier.mockResolvedValue(walter);

      await createDevToken(jwtService, usersService, { ...development, identifier: "walter" });

      expect(DEV_TOKEN_DAYS).toBe(30);
      expect(signAsync.mock.calls[0][1]).toEqual({ expiresIn: 30 * 24 * 60 * 60 });
    });
  });

  describe("when it refuses", () => {
    it("does not run in production, and reads nothing first", async () => {
      await expect(
        createDevToken(jwtService, usersService, {
          environment: "production",
          adminEmail: "admin@example.com",
          identifier: "walter",
        }),
      ).rejects.toThrow("does not run when NODE_ENV is production");

      expect(getUserByIdentifier).not.toHaveBeenCalled();
      expect(signAsync).not.toHaveBeenCalled();
    });

    it.each(["development", "staging", "test"])("runs when NODE_ENV is %s", async (environment) => {
      getUserByIdentifier.mockResolvedValue(walter);

      await expect(
        createDevToken(jwtService, usersService, {
          environment,
          adminEmail: undefined,
          identifier: "walter",
        }),
      ).resolves.toMatchObject({ token: "a.b.c" });
    });

    it.each([undefined, ""])(
      "says what to do when there is no identifier and EMAIL is %j",
      async (adminEmail) => {
        await expect(
          createDevToken(jwtService, usersService, {
            environment: "development",
            adminEmail,
            identifier: undefined,
          }),
        ).rejects.toThrow("Set EMAIL in .env for the admin, or name one");

        expect(getUserByIdentifier).not.toHaveBeenCalled();
        expect(signAsync).not.toHaveBeenCalled();
      },
    );

    it("names the identifier when no user has it", async () => {
      getUserByIdentifier.mockResolvedValue(null);

      await expect(
        createDevToken(jwtService, usersService, { ...development, identifier: "nobody" }),
      ).rejects.toThrow('No user has the username or email "nobody".');

      expect(signAsync).not.toHaveBeenCalled();
    });

    // The admin only exists once the seed has run, so that is the likely fix.
    it("points at the seed when the admin from EMAIL is missing", async () => {
      getUserByIdentifier.mockResolvedValue(null);

      await expect(
        createDevToken(jwtService, usersService, { ...development, identifier: undefined }),
      ).rejects.toThrow("Run pnpm seed:run to create the admin.");
    });

    it("does not point at the seed for a member who is missing", async () => {
      getUserByIdentifier.mockResolvedValue(null);

      await expect(
        createDevToken(jwtService, usersService, { ...development, identifier: "nobody" }),
      ).rejects.not.toThrow("pnpm seed:run");
    });
  });
});
