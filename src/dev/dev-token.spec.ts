import { JwtSigner } from "@nestjs/authentication";

import { UserRole } from "../users/user.entity.js";
import type { UsersRepository } from "../users/users.repository.js";
import { createDevToken, DEV_TOKEN_DAYS } from "./dev-token.js";

// The middle part of a JWT is its claims, as base64url JSON. Read without
// checking the signature: these tests check what was signed, not who signed.
function claimsOf(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

// createDevToken signs a token with no password asked, so most of these
// tests are about when it refuses.
describe("createDevToken", () => {
  // A real signer, as print-token.ts builds one, with a made-up key. The
  // issuer and audience stand in for the app's own.
  const signer = new JwtSigner({
    key: "made-up-test-key-that-is-at-least-32-bytes-long",
    issuer: "https://api.example.com",
    audience: "dudesphere-test",
  });
  const findByIdentifier = vi.fn();
  const usersRepository = { findByIdentifier } as unknown as UsersRepository;

  // Made-up people. Nothing here is a real account: every address is at
  // example.com, which nobody can register.
  const admin = { id: 1, username: "maude", email: "admin@example.com", role: UserRole.ADMIN };
  const walter = { id: 25, username: "walter", email: "walter@example.com", role: UserRole.USER };

  const development = { environment: "development", adminEmail: "admin@example.com" };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe("who the token is for", () => {
    it("is the admin named by EMAIL when no identifier is given", async () => {
      findByIdentifier.mockResolvedValue(admin);

      const result = await createDevToken(signer, usersRepository, {
        ...development,
        identifier: undefined,
      });

      expect(findByIdentifier).toHaveBeenCalledWith("admin@example.com");
      expect(result.user).toBe(admin);
      expect(claimsOf(result.token).sub).toBe("1");
    });

    it.each(["walter", "walter@example.com"])("is the member named by %s", async (identifier) => {
      findByIdentifier.mockResolvedValue(walter);

      const result = await createDevToken(signer, usersRepository, {
        ...development,
        identifier,
      });

      // The identifier, not EMAIL. UsersRepository decides whether it is a
      // username or an email.
      expect(findByIdentifier).toHaveBeenCalledWith(identifier);
      expect(result.user).toBe(walter);
    });
  });

  describe("what is signed", () => {
    // `sub` is the id as a string, as TokenService.issue signs it, so
    // JwtAuth reads it like any other token.
    it("names the member's id in `sub`, as a string", async () => {
      findByIdentifier.mockResolvedValue(walter);

      const { token } = await createDevToken(signer, usersRepository, {
        ...development,
        identifier: "walter",
      });

      expect(claimsOf(token).sub).toBe("25");
    });

    // The issuer and audience come from the signer, which is what makes the
    // token one the app accepts.
    it("carries the signer's issuer and audience", async () => {
      findByIdentifier.mockResolvedValue(walter);

      const { token } = await createDevToken(signer, usersRepository, {
        ...development,
        identifier: "walter",
      });

      expect(claimsOf(token)).toMatchObject({
        iss: "https://api.example.com",
        aud: "dudesphere-test",
      });
    });

    // No role and no username. JwtAuth reads the member from the database
    // on each request, so a 30-day token cannot keep a role its member has
    // lost. The only claim of its own is the dev mark.
    it("carries nothing about the member but the id", async () => {
      findByIdentifier.mockResolvedValue(walter);

      const { token } = await createDevToken(signer, usersRepository, {
        ...development,
        identifier: "walter",
      });

      expect(Object.keys(claimsOf(token)).sort()).toEqual([
        "amr",
        "aud",
        "exp",
        "iat",
        "iss",
        "jti",
        "sub",
      ]);
    });

    // It belongs to no sign-in, so it has no `sid`. JwtAuth lets a token
    // without one through only when `amr` holds "dev".
    it("is marked as a dev token, with no sid", async () => {
      findByIdentifier.mockResolvedValue(walter);

      const { token } = await createDevToken(signer, usersRepository, {
        ...development,
        identifier: "walter",
      });

      const claims = claimsOf(token);
      expect(claims.amr).toEqual(["dev"]);
      expect(claims).not.toHaveProperty("sid");
    });

    it("lasts 30 days", async () => {
      findByIdentifier.mockResolvedValue(walter);

      const { token } = await createDevToken(signer, usersRepository, {
        ...development,
        identifier: "walter",
      });

      const { iat, exp } = claimsOf(token) as { iat: number; exp: number };
      expect(DEV_TOKEN_DAYS).toBe(30);
      expect(exp - iat).toBe(30 * 24 * 60 * 60);
    });
  });

  describe("when it refuses", () => {
    it("does not run in production, and reads and signs nothing", async () => {
      const sign = vi.spyOn(signer, "sign");

      await expect(
        createDevToken(signer, usersRepository, {
          environment: "production",
          adminEmail: "admin@example.com",
          identifier: "walter",
        }),
      ).rejects.toThrow("does not run when NODE_ENV is production");

      expect(findByIdentifier).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });

    it.each(["development", "staging", "test"])("runs when NODE_ENV is %s", async (environment) => {
      findByIdentifier.mockResolvedValue(walter);

      await expect(
        createDevToken(signer, usersRepository, {
          environment,
          adminEmail: undefined,
          identifier: "walter",
        }),
      ).resolves.toMatchObject({ user: walter });
    });

    it.each([undefined, ""])(
      "says what to do when there is no identifier and EMAIL is %j",
      async (adminEmail) => {
        const sign = vi.spyOn(signer, "sign");

        await expect(
          createDevToken(signer, usersRepository, {
            environment: "development",
            adminEmail,
            identifier: undefined,
          }),
        ).rejects.toThrow("Set EMAIL in .env for the admin, or name one");

        expect(findByIdentifier).not.toHaveBeenCalled();
        expect(sign).not.toHaveBeenCalled();
      },
    );

    it("names the identifier when no user has it", async () => {
      findByIdentifier.mockResolvedValue(null);
      const sign = vi.spyOn(signer, "sign");

      await expect(
        createDevToken(signer, usersRepository, { ...development, identifier: "nobody" }),
      ).rejects.toThrow('No user has the username or email "nobody".');

      expect(sign).not.toHaveBeenCalled();
    });

    // The admin only exists once the seed has run, so that is the likely fix.
    it("points at the seed when the admin from EMAIL is missing", async () => {
      findByIdentifier.mockResolvedValue(null);

      await expect(
        createDevToken(signer, usersRepository, { ...development, identifier: undefined }),
      ).rejects.toThrow("Run pnpm seed:run to create the admin.");
    });

    it("does not point at the seed for a member who is missing", async () => {
      findByIdentifier.mockResolvedValue(null);

      await expect(
        createDevToken(signer, usersRepository, { ...development, identifier: "nobody" }),
      ).rejects.not.toThrow("pnpm seed:run");
    });
  });
});
