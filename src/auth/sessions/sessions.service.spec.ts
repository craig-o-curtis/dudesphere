import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { addUtc, getUtcNow, isAfterUtc, subtractUtc } from "@northguild/gmt";
import type { EntityManager } from "typeorm";

import { RefreshTokenInvalidException } from "../../shared/exceptions/refresh-token-invalid.exception.js";
import authConfig from "../config/auth.config.js";
import { hashOf, newOneTimeToken } from "../one-time-token.js";
import { SessionsRepository } from "./sessions.repository.js";
import { SessionsService } from "./sessions.service.js";

// The rules, with the queries faked. SessionsRepository is a stand-in here,
// so each case says what the tables hold and reads what the service asked
// for. test/tokens.e2e-spec.ts runs the same flows against the real tables.
describe("SessionsService", () => {
  let service: SessionsService;

  const jwtService = { signAsync: vi.fn() };
  const sessionsRepository = {
    createSession: vi.fn(),
    saveToken: vi.fn(),
    deleteSessionsEndedBy: vi.fn(),
    findToken: vi.fn(),
    markTokenUsed: vi.fn(),
    revokeSession: vi.fn(),
    revokeSessionsOfUser: vi.fn(),
    isSessionLive: vi.fn(),
  };
  const warn = vi.fn();
  // 15 minutes, 7 days, 30 days and 180 days, in seconds.
  const auth = {
    expiresIn: 900,
    refreshExpiresIn: 604800,
    sessionExpiresIn: 2592000,
    sessionRetention: 15552000,
  };

  const walter = { id: 25, username: "walter", email: "walter@example.com", role: "user" };
  const sessionId = "0b9f6d1e-6f0c-4a3e-9d55-2f1f6f0f7a10";

  /** The session row createSession() was last called with. */
  function createdSession() {
    const [row] = sessionsRepository.createSession.mock.calls.at(-1) as [
      { id: string; userId: number; expiresAt: string },
    ];
    return row;
  }

  /** The token row saveToken() was last called with. */
  function savedToken() {
    const [row] = sessionsRepository.saveToken.mock.calls.at(-1) as [
      { id: string; sessionId: string; expiresAt: string },
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
    sessionsRepository.markTokenUsed.mockResolvedValue(true);
    // The service warns when a token is used twice. This stands in for the
    // logger, which keeps the warning out of the test output and lets a test
    // read what was logged.
    vi.spyOn(Logger.prototype, "warn").mockImplementation(warn);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: JwtService, useValue: jwtService },
        { provide: SessionsRepository, useValue: sessionsRepository },
        { provide: authConfig.KEY, useValue: auth },
      ],
    }).compile();

    service = module.get(SessionsService);
  });

  describe("start", () => {
    it("returns an access token, a refresh token and the access token's lifetime", async () => {
      const pair = await service.start(walter);

      expect(pair).toEqual({
        accessToken: "signed.jwt.token",
        refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresIn: 900,
      });
    });

    it("saves a session row for that member, with a new id each time", async () => {
      await service.start(walter);
      const first = createdSession();
      await service.start(walter);

      expect(first.userId).toBe(25);
      expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(createdSession().id).not.toBe(first.id);
    });

    // The token row points at the session row, so the session has to be
    // there first.
    it("saves the session, then its first refresh token, pointing at it", async () => {
      await service.start(walter);

      expect(savedToken().sessionId).toBe(createdSession().id);
      expect(sessionsRepository.createSession.mock.invocationCallOrder[0]).toBeLessThan(
        sessionsRepository.saveToken.mock.invocationCallOrder[0],
      );
    });

    // The table must never hold something a reader could use.
    it("stores a hash of the refresh token, and not the token", async () => {
      const { refreshToken } = await service.start(walter);

      expect(savedToken().id).toBe(hashOf(refreshToken));
      expect(JSON.stringify(sessionsRepository.saveToken.mock.calls)).not.toContain(refreshToken);
    });

    it("gives the refresh token 7 days and the session 30", async () => {
      const before = getUtcNow();

      await service.start(walter);

      expect(isAbout(savedToken().expiresAt, addUtc(before, { seconds: 604800 }))).toBe(true);
      expect(isAbout(createdSession().expiresAt, addUtc(before, { seconds: 2592000 }))).toBe(true);
    });

    // A session's rows are kept for 180 days after its end, so the cutoff is
    // 180 days ago, and not now.
    it("has the sessions that ended 180 days ago deleted, and none newer", async () => {
      const before = getUtcNow();

      await service.start(walter);

      const [cutoff] = sessionsRepository.deleteSessionsEndedBy.mock.calls.at(-1) as [string];
      expect(isAbout(cutoff, subtractUtc(before, { seconds: 15552000 }))).toBe(true);
    });

    // `sub` is what JwtAuthGuard reads back as the logged-in member, and
    // `sid` is how it finds the session row. No role and no email: the guard
    // reads the member from the database on every request, so anything else
    // in the token would only go stale.
    it("signs the member's id and username and the session id, and nothing else", async () => {
      await service.start(walter);

      expect(jwtService.signAsync).toHaveBeenCalledTimes(1);
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 25,
        username: "walter",
        sid: createdSession().id,
      });
    });
  });

  describe("refresh", () => {
    const presented = newOneTimeToken();

    /**
     * What the repository finds for a token that is good to swap: its row,
     * its session's row, and the member. Each part takes overrides.
     */
    function found(overrides: { token?: object; session?: object; member?: object | null } = {}) {
      const now = getUtcNow();
      return {
        token: {
          id: hashOf(presented),
          sessionId,
          expiresAt: addUtc(now, { seconds: 3600 }),
          usedAt: null,
          ...overrides.token,
        },
        session: {
          id: sessionId,
          userId: 25,
          expiresAt: addUtc(now, { seconds: 86400 }),
          revokedAt: null,
          ...overrides.session,
        },
        member: overrides.member === undefined ? { id: 25, username: "walter" } : overrides.member,
      };
    }

    async function expectRefused(attempt: Promise<unknown>) {
      await expect(attempt).rejects.toBeInstanceOf(RefreshTokenInvalidException);
      await expect(attempt).rejects.toMatchObject({ errorCode: "REFRESH_TOKEN_INVALID" });
    }

    describe("a token that is good to swap", () => {
      it("returns a new pair", async () => {
        sessionsRepository.findToken.mockResolvedValue(found());

        const pair = await service.refresh(presented);

        expect(sessionsRepository.findToken).toHaveBeenCalledWith(hashOf(presented));
        expect(pair).toEqual({
          accessToken: "signed.jwt.token",
          refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
          expiresIn: 900,
        });
        expect(pair.refreshToken).not.toBe(presented);
      });

      // A refresh renews a session. It never starts one.
      it("keeps the successor in the same session, and makes no new session", async () => {
        sessionsRepository.findToken.mockResolvedValue(found());

        const { refreshToken } = await service.refresh(presented);

        expect(savedToken()).toMatchObject({ id: hashOf(refreshToken), sessionId });
        expect(sessionsRepository.createSession).not.toHaveBeenCalled();
        expect(jwtService.signAsync).toHaveBeenCalledWith({
          sub: 25,
          username: "walter",
          sid: sessionId,
        });
      });

      // The session's end is fixed at login. A refresh near the end must not
      // push a token past it.
      it("never lets the successor outlive the session", async () => {
        const row = found();
        sessionsRepository.findToken.mockResolvedValue(row);

        await service.refresh(presented);

        // The session has a day left, and a refresh token would get seven.
        expect(savedToken().expiresAt).toBe(row.session.expiresAt);
      });

      it("spends the token it was given", async () => {
        sessionsRepository.findToken.mockResolvedValue(found());

        await service.refresh(presented);

        expect(sessionsRepository.markTokenUsed).toHaveBeenCalledWith(
          hashOf(presented),
          expect.any(String),
        );
        expect(sessionsRepository.revokeSession).not.toHaveBeenCalled();
      });

      // If the app stopped between the two, the member must still hold a
      // token that works.
      it("saves the successor before it spends the old token", async () => {
        sessionsRepository.findToken.mockResolvedValue(found());

        await service.refresh(presented);

        const saved = sessionsRepository.saveToken.mock.invocationCallOrder[0];
        const spent = sessionsRepository.markTokenUsed.mock.invocationCallOrder[0];
        expect(saved).toBeLessThan(spent);
      });

      // The username may have changed since login.
      it("signs the new access token for the member as they are now", async () => {
        sessionsRepository.findToken.mockResolvedValue(
          found({ member: { id: 25, username: "sobchak" } }),
        );

        await service.refresh(presented);

        expect(jwtService.signAsync).toHaveBeenCalledWith(
          expect.objectContaining({ sub: 25, username: "sobchak" }),
        );
      });
    });

    describe("a token that is refused, with the session left alone", () => {
      afterEach(() => {
        expect(sessionsRepository.saveToken).not.toHaveBeenCalled();
        expect(sessionsRepository.revokeSession).not.toHaveBeenCalled();
        expect(jwtService.signAsync).not.toHaveBeenCalled();
      });

      // An access token sent by mistake is among these.
      it.each([
        ["an empty string", ""],
        ["text that is not a token", "not-a-token"],
        ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJl"],
      ])("%s, without asking the database", async (_what, value) => {
        await expectRefused(service.refresh(value));

        expect(sessionsRepository.findToken).not.toHaveBeenCalled();
      });

      it("a token no row has", async () => {
        sessionsRepository.findToken.mockResolvedValue(null);

        await expectRefused(service.refresh(presented));
      });

      // A logout, a password change or an earlier theft. The session's row
      // says so, and nothing more is done to it.
      it("a token whose session was ended on purpose", async () => {
        sessionsRepository.findToken.mockResolvedValue(
          found({ session: { revokedAt: subtractUtc(getUtcNow(), { seconds: 60 }) } }),
        );

        await expectRefused(service.refresh(presented));
      });

      // The rows are still in the tables, kept as a record, but the session
      // reached its end. Even a spent token is plainly refused here: nobody
      // can be robbed of a session that is over, so there is no theft to
      // report and nothing to end.
      it("a token of a session that has reached its end, spent or not", async () => {
        const ended = subtractUtc(getUtcNow(), { seconds: 1 });
        sessionsRepository.findToken.mockResolvedValue(
          found({ token: { expiresAt: ended, usedAt: ended }, session: { expiresAt: ended } }),
        );

        await expectRefused(service.refresh(presented));

        expect(warn).not.toHaveBeenCalled();
      });

      // The member was away too long. Nothing was stolen.
      it("an unused token that has expired", async () => {
        sessionsRepository.findToken.mockResolvedValue(
          found({ token: { expiresAt: subtractUtc(getUtcNow(), { seconds: 1 }) } }),
        );

        await expectRefused(service.refresh(presented));
      });
    });

    describe("a token that is refused, and ends the session", () => {
      afterEach(() => {
        expect(sessionsRepository.revokeSession).toHaveBeenCalledWith(
          sessionId,
          expect.any(String),
        );
      });

      // Two parties hold it, and nothing says which is the member.
      it("a token that was used before", async () => {
        sessionsRepository.findToken.mockResolvedValue(found({ token: { usedAt: getUtcNow() } }));

        await expectRefused(service.refresh(presented));

        expect(sessionsRepository.saveToken).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Session ${sessionId} is ended`));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("user #25"));
      });

      // Used, and long expired: still a second use, for as long as the
      // session is going.
      it("a used token, even after it has expired", async () => {
        sessionsRepository.findToken.mockResolvedValue(
          found({
            token: {
              usedAt: subtractUtc(getUtcNow(), { seconds: 7200 }),
              expiresAt: subtractUtc(getUtcNow(), { seconds: 3600 }),
            },
          }),
        );

        await expectRefused(service.refresh(presented));
      });

      // Two requests with one token, at the same moment. Both read it as
      // unused, and only one can mark it. This is the one that could not.
      it("a token another request spent a moment earlier", async () => {
        sessionsRepository.findToken.mockResolvedValue(found());
        sessionsRepository.markTokenUsed.mockResolvedValue(false);

        await expectRefused(service.refresh(presented));

        expect(warn).toHaveBeenCalled();
      });

      // Closing an account ends its sessions, so this should not be
      // reachable. It is the backstop if a session ever slips through.
      it("a token whose member has closed their account", async () => {
        sessionsRepository.findToken.mockResolvedValue(found({ member: null }));

        await expectRefused(service.refresh(presented));

        expect(sessionsRepository.saveToken).not.toHaveBeenCalled();
      });
    });

    // The log is for whoever runs the app. It must not hold a token.
    it("never writes the token to the log", async () => {
      sessionsRepository.findToken.mockResolvedValue(found({ token: { usedAt: getUtcNow() } }));

      await service.refresh(presented).catch(() => undefined);

      expect(JSON.stringify(warn.mock.calls)).not.toContain(presented);
    });
  });

  // Logging out one device.
  describe("end", () => {
    const presented = newOneTimeToken();
    const session = { id: sessionId, userId: 25 };

    it("ends the session the token belongs to", async () => {
      sessionsRepository.findToken.mockResolvedValue({
        token: { id: hashOf(presented), sessionId },
        session,
        member: { id: 25, username: "walter" },
      });

      await service.end(presented);

      expect(sessionsRepository.findToken).toHaveBeenCalledWith(hashOf(presented));
      expect(sessionsRepository.revokeSession).toHaveBeenCalledWith(sessionId, expect.any(String));
    });

    // A client that kept an old token of the session can still log out.
    it("works with a token of the session that was already spent", async () => {
      sessionsRepository.findToken.mockResolvedValue({
        token: { id: hashOf(presented), sessionId, usedAt: getUtcNow() },
        session,
        member: { id: 25, username: "walter" },
      });

      await service.end(presented);

      expect(sessionsRepository.revokeSession).toHaveBeenCalledWith(sessionId, expect.any(String));
    });

    // No error for either. The route answers 204 whatever it is given, so
    // it cannot be used to find out whether a token is real.
    it("does nothing, and raises nothing, for a token no row has", async () => {
      sessionsRepository.findToken.mockResolvedValue(null);

      await expect(service.end(presented)).resolves.toBeUndefined();

      expect(sessionsRepository.revokeSession).not.toHaveBeenCalled();
    });

    it("does nothing for text that is not a token, without asking the database", async () => {
      await expect(service.end("not-a-token")).resolves.toBeUndefined();

      expect(sessionsRepository.findToken).not.toHaveBeenCalled();
      expect(sessionsRepository.revokeSession).not.toHaveBeenCalled();
    });
  });

  // Logging out every device.
  describe("endAll", () => {
    it("ends every session of that member", async () => {
      await service.endAll(25);

      expect(sessionsRepository.revokeSessionsOfUser).toHaveBeenCalledWith(
        25,
        expect.any(String),
        undefined,
      );
    });

    // UsersService calls this inside the transaction that changes a
    // password or closes an account.
    it("passes the caller's transaction on, when it is given one", async () => {
      const manager = {} as EntityManager;

      await service.endAll(25, manager);

      expect(sessionsRepository.revokeSessionsOfUser).toHaveBeenCalledWith(
        25,
        expect.any(String),
        manager,
      );
    });
  });

  // What JwtAuthGuard asks on every logged-in request.
  describe("isLive", () => {
    it("asks about that session as of now, and gives the answer back", async () => {
      sessionsRepository.isSessionLive.mockResolvedValue(true);

      await expect(service.isLive(sessionId)).resolves.toBe(true);

      expect(sessionsRepository.isSessionLive).toHaveBeenCalledWith(sessionId, expect.any(String));
    });

    it("is false when the repository says the session is not going", async () => {
      sessionsRepository.isSessionLive.mockResolvedValue(false);

      await expect(service.isLive(sessionId)).resolves.toBe(false);
    });
  });
});
