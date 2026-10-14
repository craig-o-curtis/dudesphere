import { type AuthenticationStorage, SessionService, TokenService } from "@nestjs/authentication";
import { getUtcNow } from "@northguild/gmt";
import type { DataSource, EntityManager } from "typeorm";

import { ClockUnavailableException } from "../shared/exceptions/clock-unavailable.exception.js";
import { RefreshTokenEntity, SessionEntity } from "./authentication.entities.js";
import { SignInsRepository } from "./sign-ins.repository.js";

// Mocked so the time passed to the query is known, and so the "" that gmt
// returns when it cannot read the clock is reachable.
vi.mock("@northguild/gmt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@northguild/gmt")>()),
  getUtcNow: vi.fn(),
}));

const UTC_NOW = "2026-10-14T09:25:42.204006202Z";

// These cases check what each method hands TypeORM, and what it does with
// the answer. The SQL itself is proved against the real database in the e2e
// tests: a revoked sign-in, a sign-in past its family's end, and another
// member's sid all get 401 in test/tokens.e2e-spec.ts.
describe("SignInsRepository", () => {
  const dataSource = { query: vi.fn() };
  const manager = { update: vi.fn(), delete: vi.fn() };

  const repository = new SignInsRepository(dataSource as unknown as DataSource);

  // A sign-in's id, as TokensController makes it: a UUID.
  const sid = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUtcNow).mockReturnValue(UTC_NOW);
  });

  describe("isLive", () => {
    // The time is passed in, not read by Postgres, so the app's clock
    // decides when a sign-in's family has run out.
    it("asks once, with the sid, the member and the current time", async () => {
      dataSource.query.mockResolvedValue([{ live: true }]);

      await repository.isLive(sid, "25");

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [sid, "25", UTC_NOW]);
    });

    it.each([true, false])("answers %s when the row says so", async (live) => {
      dataSource.query.mockResolvedValue([{ live }]);

      await expect(repository.isLive(sid, "25")).resolves.toBe(live);
    });

    // Without a time, no sign-in could be judged. It fails before asking.
    it("asks nothing when the clock cannot be read", async () => {
      vi.mocked(getUtcNow).mockReturnValue("");

      await expect(repository.isLive(sid, "25")).rejects.toBeInstanceOf(ClockUnavailableException);

      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe("endAllForUser", () => {
    // The package keeps every user id as a string. Both writes go through
    // the caller's manager, so they join the caller's transaction.
    it("revokes every refresh token and deletes every session, through the manager", async () => {
      manager.update.mockResolvedValue({ affected: 2 });
      manager.delete.mockResolvedValue({ affected: 1 });

      await expect(
        repository.endAllForUser(25, manager as unknown as EntityManager),
      ).resolves.toBeUndefined();

      expect(manager.update).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledWith(
        RefreshTokenEntity,
        { userId: "25" },
        { revoked: true },
      );
      expect(manager.delete).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(SessionEntity, { userId: "25" });
    });

    // Swallowing it would let the caller's transaction commit with the
    // sign-ins still going.
    it("lets a failed write through", async () => {
      const down = new Error("database down");
      manager.update.mockRejectedValue(down);

      await expect(repository.endAllForUser(25, manager as unknown as EntityManager)).rejects.toBe(
        down,
      );
    });
  });

  // endAllForUser stands in for the package's two revokeAll calls, because
  // they cannot join a transaction. Both run the functions in
  // end-sign-ins.ts, so the writes cannot drift. What can drift is the
  // package: a new version could make revokeAll reach another store method,
  // and endAllForUser would quietly miss it. These build the package's own
  // services on a store that records every call, and fail if that happens.
  describe("matches the package's revokeAll", () => {
    /** A store that records each method called on it, and does nothing. */
    function recordingStore(calls: string[][]): object {
      return new Proxy(
        {},
        {
          get: (_target, method) =>
            function record(...args: unknown[]) {
              calls.push([String(method), ...args.map(String)]);
              return Promise.resolve(undefined);
            },
        },
      );
    }

    function storageWith(calls: string[][]): AuthenticationStorage {
      return {
        refreshTokens: recordingStore(calls),
        sessions: recordingStore(calls),
      } as unknown as AuthenticationStorage;
    }

    it("TokenService.revokeAll only revokes the member's refresh tokens", async () => {
      const calls: string[][] = [];
      // A key is needed for revokeAll to do anything; refresh tokens are on
      // by default, as they are in this app.
      const tokens = new TokenService(storageWith(calls), {
        accessToken: { key: "a-key-only-for-this-test-at-least-32-bytes" },
      });

      await tokens.revokeAll("25");

      expect(calls).toEqual([["revokeUserRefreshTokens", "25"]]);
    });

    it("SessionService.revokeAll only deletes the member's sessions", async () => {
      const calls: string[][] = [];
      const sessions = new SessionService(storageWith(calls), {});

      await sessions.revokeAll("25");

      expect(calls).toEqual([["deleteUserSessions", "25"]]);
    });
  });
});
