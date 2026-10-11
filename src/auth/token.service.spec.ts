import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { addUtc, getUtcNow, isAfterUtc, subtractUtc } from "@northguild/gmt";

import { RefreshTokenInvalidException } from "../shared/exceptions/refresh-token-invalid.exception.js";
import { UsersService } from "../users/users.service.js";
import authConfig from "./config/auth.config.js";
import { hashOf, newOneTimeToken } from "./one-time-token.js";
import { RefreshTokensService } from "./refresh-tokens.service.js";
import { TokenService } from "./token.service.js";

describe("TokenService", () => {
  let service: TokenService;

  const jwtService = { signAsync: vi.fn() };
  const refreshTokens = {
    save: vi.fn(),
    find: vi.fn(),
    markUsed: vi.fn(),
    revokeFamily: vi.fn(),
    isFamilyRevoked: vi.fn(),
  };
  const usersService = { getLiveUser: vi.fn() };
  const warn = vi.fn();
  // 15 minutes, 7 days and 30 days, in seconds.
  const auth = { expiresIn: 900, refreshExpiresIn: 604800, sessionExpiresIn: 2592000 };

  const walter = { id: 25, username: "walter", email: "w@x.com", role: "user" };
  const familyId = "0b9f6d1e-6f0c-4a3e-9d55-2f1f6f0f7a10";

  /** The row save() was last called with. */
  function savedRow() {
    const [row] = refreshTokens.save.mock.calls.at(-1) as [
      { id: string; familyId: string; userId: number; expiresAt: string; familyExpiresAt: string },
      string,
    ];
    return row;
  }

  /** True when `instant` is within a minute after `earliest`. */
  function isAbout(instant: string, earliest: string): boolean {
    return !isAfterUtc(earliest, instant) && isAfterUtc(addUtc(earliest, { seconds: 60 }), instant);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    jwtService.signAsync.mockResolvedValue("signed.jwt.token");
    refreshTokens.isFamilyRevoked.mockResolvedValue(false);
    refreshTokens.markUsed.mockResolvedValue(true);
    usersService.getLiveUser.mockResolvedValue({ userId: 25, username: "walter", role: "user" });
    // The service warns when a token is used twice. This stands in for the
    // logger, which keeps the warning out of the test output and lets a test
    // read what was logged.
    vi.spyOn(Logger.prototype, "warn").mockImplementation(warn);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: RefreshTokensService, useValue: refreshTokens },
        { provide: UsersService, useValue: usersService },
        { provide: authConfig.KEY, useValue: auth },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  describe("issue", () => {
    it("returns an access token, a refresh token and the access token's lifetime", async () => {
      const pair = await service.issue(walter);

      expect(pair).toEqual({
        accessToken: "signed.jwt.token",
        refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresIn: 900,
      });
    });

    // The table must never hold something a reader could use.
    it("stores a hash of the refresh token, and not the token", async () => {
      const { refreshToken } = await service.issue(walter);

      expect(savedRow().id).toBe(hashOf(refreshToken));
      expect(JSON.stringify(refreshTokens.save.mock.calls)).not.toContain(refreshToken);
    });

    it("starts a new session each time", async () => {
      await service.issue(walter);
      const first = savedRow().familyId;
      await service.issue(walter);

      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(savedRow().familyId).not.toBe(first);
    });

    it("gives the refresh token 7 days and the session 30", async () => {
      const before = getUtcNow();

      await service.issue(walter);

      const row = savedRow();
      expect(row.userId).toBe(25);
      expect(isAbout(row.expiresAt, addUtc(before, { seconds: 604800 }))).toBe(true);
      expect(isAbout(row.familyExpiresAt, addUtc(before, { seconds: 2592000 }))).toBe(true);
    });

    // `sub` is what JwtAuthGuard reads back as the signed-in member, and
    // `sid` is how it knows which session the token belongs to. No role and
    // no email: the guard reads the member from the database on every
    // request, so anything else in the token would only go stale.
    it("signs the member's id and username and the session id, and nothing else", async () => {
      await service.issue(walter);

      expect(jwtService.signAsync).toHaveBeenCalledTimes(1);
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 25,
        username: "walter",
        sid: savedRow().familyId,
      });
    });
  });

  describe("refresh", () => {
    const presented = newOneTimeToken();

    /** A stored token that is good to swap, with `overrides` laid over it. */
    function stored(overrides: object = {}) {
      const now = getUtcNow();
      return {
        id: hashOf(presented),
        familyId,
        userId: 25,
        expiresAt: addUtc(now, { seconds: 3600 }),
        familyExpiresAt: addUtc(now, { seconds: 86400 }),
        usedAt: null,
        revoked: false,
        ...overrides,
      };
    }

    async function expectRefused(attempt: Promise<unknown>) {
      await expect(attempt).rejects.toBeInstanceOf(RefreshTokenInvalidException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "REFRESH_TOKEN_INVALID" });
    }

    describe("a token that is good to swap", () => {
      it("returns a new pair", async () => {
        refreshTokens.find.mockResolvedValue(stored());

        const pair = await service.refresh(presented);

        expect(refreshTokens.find).toHaveBeenCalledWith(hashOf(presented));
        expect(pair).toEqual({
          accessToken: "signed.jwt.token",
          refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
          expiresIn: 900,
        });
        expect(pair.refreshToken).not.toBe(presented);
      });

      it("keeps the successor in the same session, with the same end", async () => {
        const token = stored();
        refreshTokens.find.mockResolvedValue(token);

        const { refreshToken } = await service.refresh(presented);

        expect(savedRow()).toMatchObject({
          id: hashOf(refreshToken),
          familyId,
          userId: 25,
          familyExpiresAt: token.familyExpiresAt,
        });
        expect(jwtService.signAsync).toHaveBeenCalledWith({
          sub: 25,
          username: "walter",
          sid: familyId,
        });
      });

      // The session's end is fixed at sign-in. A refresh near the end must
      // not push a token past it.
      it("never lets the successor outlive the session", async () => {
        const token = stored();
        refreshTokens.find.mockResolvedValue(token);

        await service.refresh(presented);

        // The session has a day left, and a refresh token would get seven.
        expect(savedRow().expiresAt).toBe(token.familyExpiresAt);
      });

      it("spends the token it was given", async () => {
        refreshTokens.find.mockResolvedValue(stored());

        await service.refresh(presented);

        expect(refreshTokens.markUsed).toHaveBeenCalledWith(hashOf(presented), expect.any(String));
        expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
      });

      // If the app stopped between the two, the member must still hold a
      // token that works.
      it("saves the successor before it spends the old token", async () => {
        refreshTokens.find.mockResolvedValue(stored());

        await service.refresh(presented);

        const saved = refreshTokens.save.mock.invocationCallOrder[0];
        const spent = refreshTokens.markUsed.mock.invocationCallOrder[0];
        expect(saved).toBeLessThan(spent);
      });

      // The username may have changed since sign-in.
      it("signs the new access token for the member as they are now", async () => {
        refreshTokens.find.mockResolvedValue(stored());
        usersService.getLiveUser.mockResolvedValue({
          userId: 25,
          username: "sobchak",
          role: "user",
        });

        await service.refresh(presented);

        expect(jwtService.signAsync).toHaveBeenCalledWith(
          expect.objectContaining({ sub: 25, username: "sobchak" }),
        );
      });
    });

    describe("a token that is refused, with the session left alone", () => {
      afterEach(() => {
        expect(refreshTokens.save).not.toHaveBeenCalled();
        expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
        expect(jwtService.signAsync).not.toHaveBeenCalled();
      });

      // An access token sent by mistake is among these.
      it.each([
        ["an empty string", ""],
        ["text that is not a token", "not-a-token"],
        ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJl"],
      ])("%s, without asking the database", async (_what, value) => {
        await expectRefused(service.refresh(value));

        expect(refreshTokens.find).not.toHaveBeenCalled();
      });

      it("a token no row has", async () => {
        refreshTokens.find.mockResolvedValue(null);

        await expectRefused(service.refresh(presented));
      });

      it("a token whose session was already ended", async () => {
        refreshTokens.find.mockResolvedValue(stored());
        refreshTokens.isFamilyRevoked.mockResolvedValue(true);

        await expectRefused(service.refresh(presented));

        expect(refreshTokens.isFamilyRevoked).toHaveBeenCalledWith(familyId);
      });

      // The member was away too long. Nothing was stolen.
      it("an unused token that has expired", async () => {
        refreshTokens.find.mockResolvedValue(
          stored({ expiresAt: subtractUtc(getUtcNow(), { seconds: 1 }) }),
        );

        await expectRefused(service.refresh(presented));
      });
    });

    describe("a token that is refused, and ends the session", () => {
      afterEach(() => {
        expect(refreshTokens.revokeFamily).toHaveBeenCalledWith(familyId);
      });

      // Two parties hold it, and nothing says which is the member.
      it("a token that was used before", async () => {
        refreshTokens.find.mockResolvedValue(stored({ usedAt: getUtcNow() }));

        await expectRefused(service.refresh(presented));

        expect(refreshTokens.save).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Session ${familyId} is ended`));
      });

      // Used, and long expired: still a second use.
      it("a used token, even after it has expired", async () => {
        refreshTokens.find.mockResolvedValue(
          stored({
            usedAt: subtractUtc(getUtcNow(), { seconds: 7200 }),
            expiresAt: subtractUtc(getUtcNow(), { seconds: 3600 }),
          }),
        );

        await expectRefused(service.refresh(presented));
      });

      // Two requests with one token, at the same moment. Both read it as
      // unused, and only one can mark it. This is the one that could not.
      it("a token another request spent a moment earlier", async () => {
        refreshTokens.find.mockResolvedValue(stored());
        refreshTokens.markUsed.mockResolvedValue(false);

        await expectRefused(service.refresh(presented));

        expect(warn).toHaveBeenCalled();
      });

      it("a token whose member has closed their account", async () => {
        refreshTokens.find.mockResolvedValue(stored());
        usersService.getLiveUser.mockResolvedValue(null);

        await expectRefused(service.refresh(presented));

        expect(usersService.getLiveUser).toHaveBeenCalledWith(25);
        expect(refreshTokens.save).not.toHaveBeenCalled();
      });
    });

    // The log is for whoever runs the app. It must not hold a token.
    it("never writes the token to the log", async () => {
      refreshTokens.find.mockResolvedValue(stored({ usedAt: getUtcNow() }));

      await service.refresh(presented).catch(() => undefined);

      expect(JSON.stringify(warn.mock.calls)).not.toContain(presented);
    });
  });
});
