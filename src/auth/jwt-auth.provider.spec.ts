import type { AuthenticationRegistry } from "@nestjs/authentication";
import type { ConfigType } from "@nestjs/config";
import { convertUtcToUnix } from "@northguild/gmt";

import type appConfig from "../config/app.config.js";
import type { SignInsRepository } from "../typeorm/sign-ins.repository.js";
import type { UsersRepository } from "../users/users.repository.js";
import { DEV_TOKEN_AMR, JwtAuth } from "./jwt-auth.provider.js";

// The package checks the signature, `exp`, `iss` and `aud` before validate()
// runs, and has its own tests for that. These call validate() directly with
// claims that already passed those checks.
describe("JwtAuth", () => {
  const usersRepository = { findById: vi.fn() };
  const signIns = { isLive: vi.fn() };
  const registry = { registerProvider: vi.fn() };
  // Development, unless a case says otherwise.
  const app = { environment: "development", port: 3000 } as ConfigType<typeof appConfig>;

  let provider: JwtAuth;

  // A made-up member who has never changed their password.
  const walter = { id: 25, username: "walter", passwordChangedAt: null };

  // The second the password changed, in seconds since 1970, and the
  // timestamp itself, half a second into that second.
  const changedAt = "2026-10-14T09:00:00.500Z";
  const changedSecond = convertUtcToUnix(changedAt, { epochUnit: "seconds" }) as number;

  // A sign-in's id, as TokensController makes it: a UUID.
  const sid = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

  beforeEach(() => {
    vi.resetAllMocks();
    app.environment = "development";
    provider = new JwtAuth(
      usersRepository as unknown as UsersRepository,
      signIns as unknown as SignInsRepository,
      registry as unknown as AuthenticationRegistry,
      app,
    );
    // Every sign-in is still going, unless a case says otherwise.
    signIns.isLive.mockResolvedValue(true);
  });

  // Without this, the guard never asks it about a bearer token.
  it("registers itself with the authentication registry", () => {
    expect(registry.registerProvider).toHaveBeenCalledTimes(1);
    expect(registry.registerProvider).toHaveBeenCalledWith(provider);
  });

  describe("validate", () => {
    it("loads the member named by `sub` and returns them", async () => {
      usersRepository.findById.mockResolvedValue(walter);

      await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBe(walter);

      expect(usersRepository.findById).toHaveBeenCalledWith(25);
    });

    // A soft-deleted member is not found, so a closed account's tokens stop
    // working at once.
    it("returns null when no member has that id", async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBeNull();
    });

    // `sub` is always String(user.id). Anything else was not signed by this
    // app, so it is refused without a database read.
    it.each([
      ["no sub", undefined],
      ["an empty sub", ""],
      ["zero", "0"],
      ["a leading zero", "025"],
      ["a negative id", "-25"],
      ["a fraction", "2.5"],
      ["a space", " 25"],
      ["a username", "walter"],
      ["an id past the largest the column holds", "2147483648"],
    ])("returns null for %s, without a lookup", async (_what, sub) => {
      await expect(provider.validate({ sub, sid, iat: changedSecond })).resolves.toBeNull();

      expect(usersRepository.findById).not.toHaveBeenCalled();
      expect(signIns.isLive).not.toHaveBeenCalled();
    });

    it.each([
      ["no iat", undefined],
      ["an iat that is text", String(changedSecond)],
    ])("returns null for %s, without a lookup", async (_what, iat) => {
      await expect(
        provider.validate({ sub: "25", sid, iat: iat as unknown as number }),
      ).resolves.toBeNull();

      expect(usersRepository.findById).not.toHaveBeenCalled();
      expect(signIns.isLive).not.toHaveBeenCalled();
    });

    describe("the token's sign-in", () => {
      beforeEach(() => {
        usersRepository.findById.mockResolvedValue(walter);
      });

      it("accepts a token whose sign-in is still going", async () => {
        await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBe(
          walter,
        );

        expect(signIns.isLive).toHaveBeenCalledTimes(1);
        expect(signIns.isLive).toHaveBeenCalledWith(sid, "25");
      });

      // A sign-out, a reset or a reused refresh token ended it. The access
      // token must stop on the next request, not when it runs out.
      it("refuses a token whose sign-in has ended", async () => {
        signIns.isLive.mockResolvedValue(false);

        await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBeNull();
      });

      // TokensController only ever makes a UUID. Anything else was not
      // signed by this app, so it never reaches the database.
      it.each([
        ["an empty sid", ""],
        ["a sid that is not a UUID", "not-a-uuid"],
        ["a UUID with more after it", `${sid}0`],
        ["a sid that is a number", 42],
        ["a null sid", null],
      ])("refuses %s, without asking whether it is live", async (_what, badSid) => {
        await expect(
          provider.validate({ sub: "25", sid: badSid, iat: changedSecond }),
        ).resolves.toBeNull();

        expect(signIns.isLive).not.toHaveBeenCalled();
      });

      // `pnpm dev:token` signs a token that belongs to no sign-in, and
      // marks it with `amr: ["dev"]`. See src/dev/dev-token.ts.
      it("accepts a dev token with no sid, without asking whether it is live", async () => {
        await expect(
          provider.validate({ sub: "25", amr: [DEV_TOKEN_AMR], iat: changedSecond }),
        ).resolves.toBe(walter);

        expect(signIns.isLive).not.toHaveBeenCalled();
      });

      // `pnpm dev:token` will not sign one in production. If one were signed
      // with the production key anyway, nothing but its 30 days would end it.
      it("refuses a dev token in production", async () => {
        app.environment = "production";

        await expect(
          provider.validate({ sub: "25", amr: [DEV_TOKEN_AMR], iat: changedSecond }),
        ).resolves.toBeNull();

        expect(signIns.isLive).not.toHaveBeenCalled();
      });

      // Only a token with no sid is a dev token. In production a sign-in
      // token is checked as anywhere else.
      it("still accepts a sign-in token in production", async () => {
        app.environment = "production";

        await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBe(
          walter,
        );
      });

      // Every other token carries a sid. One without it, and without the
      // dev mark, is refused.
      it.each([
        ["no amr", undefined],
        ["a password sign-in's amr", ["pwd"]],
        ["an amr that is text, not a list", "dev"],
        ["an empty amr", []],
      ])("refuses a token with no sid and %s", async (_what, amr) => {
        await expect(provider.validate({ sub: "25", amr, iat: changedSecond })).resolves.toBeNull();

        expect(signIns.isLive).not.toHaveBeenCalled();
      });

      // The two reads run side by side, so the sign-in check adds no wait.
      // Both are asked before either answers.
      it("asks for the member and the sign-in side by side", async () => {
        let answerMember: (user: typeof walter) => void = () => {};
        usersRepository.findById.mockReturnValue(
          new Promise((resolve) => {
            answerMember = resolve;
          }),
        );

        const result = provider.validate({ sub: "25", sid, iat: changedSecond });

        expect(usersRepository.findById).toHaveBeenCalledWith(25);
        expect(signIns.isLive).toHaveBeenCalledWith(sid, "25");

        answerMember(walter);
        await expect(result).resolves.toBe(walter);
      });

      // A closed account and an ended sign-in each refuse on their own.
      it("refuses when the member is gone, even though the sign-in is live", async () => {
        usersRepository.findById.mockResolvedValue(null);

        await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBeNull();
      });
    });

    describe("after a password change", () => {
      const changed = { ...walter, passwordChangedAt: changedAt };

      beforeEach(() => {
        usersRepository.findById.mockResolvedValue(changed);
      });

      it("accepts a token signed after the change", async () => {
        await expect(provider.validate({ sub: "25", sid, iat: changedSecond + 60 })).resolves.toBe(
          changed,
        );
      });

      // A token records only whole seconds. One signed in the same second
      // as the change is far more often the member signing in straight
      // after a reset than an old token.
      it("accepts a token signed in the same second as the change", async () => {
        await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBe(
          changed,
        );
      });

      // Whoever holds it signed in with the old password.
      it("refuses a token signed in the second before the change", async () => {
        await expect(
          provider.validate({ sub: "25", sid, iat: changedSecond - 1 }),
        ).resolves.toBeNull();
      });

      it("refuses a token signed long before the change", async () => {
        await expect(
          provider.validate({ sub: "25", sid, iat: changedSecond - 86_400 }),
        ).resolves.toBeNull();
      });

      // The second before ends exactly when the change happens. The change
      // is not after the token, so the token is still refused.
      it("refuses a token from the second before a change made on the second", async () => {
        const onTheSecond = { ...walter, passwordChangedAt: "2026-10-14T09:00:00.000Z" };
        usersRepository.findById.mockResolvedValue(onTheSecond);

        await expect(
          provider.validate({ sub: "25", sid, iat: changedSecond - 1 }),
        ).resolves.toBeNull();
        await expect(provider.validate({ sub: "25", sid, iat: changedSecond })).resolves.toBe(
          onTheSecond,
        );
      });

      // A stored time that cannot be read must fail closed.
      it("refuses the token when passwordChangedAt cannot be read", async () => {
        usersRepository.findById.mockResolvedValue({ ...walter, passwordChangedAt: "not a time" });

        await expect(
          provider.validate({ sub: "25", sid, iat: changedSecond + 60 }),
        ).resolves.toBeNull();
      });
    });
  });
});
