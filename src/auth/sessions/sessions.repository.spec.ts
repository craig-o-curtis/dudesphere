import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { type EntityManager, IsNull, LessThanOrEqual, MoreThan } from "typeorm";

import { RefreshToken } from "./refresh-token.entity.js";
import { Session } from "./session.entity.js";
import { SessionsRepository } from "./sessions.repository.js";

// These cases cover what each method asks the database and what it makes of
// the answer. test/tokens.e2e-spec.ts runs the statements against the real
// database: the one-winner UPDATE, the session check, the join that finds a
// token's member, and the deleting of sessions that ended 180 days ago.
describe("SessionsRepository", () => {
  let repository: SessionsRepository;

  const sessions = {
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    existsBy: vi.fn(),
  };
  const refreshTokens = {
    insert: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
  };

  const now = "2026-10-11T12:00:00.000Z";
  const hash = "a".repeat(64);
  const sessionId = "0b9f6d1e-6f0c-4a3e-9d55-2f1f6f0f7a10";

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsRepository,
        { provide: getRepositoryToken(Session), useValue: sessions },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
      ],
    }).compile();

    repository = module.get(SessionsRepository);
  });

  describe("createSession", () => {
    it("inserts the session row as given", async () => {
      const session = { id: sessionId, userId: 25, expiresAt: "2026-11-10T12:00:00.000Z" };

      await repository.createSession(session);

      expect(sessions.insert).toHaveBeenCalledWith(session);
    });
  });

  describe("saveToken", () => {
    it("inserts the token row as given", async () => {
      const token = { id: hash, sessionId, expiresAt: "2026-10-18T12:00:00.000Z" };

      await repository.saveToken(token);

      expect(refreshTokens.insert).toHaveBeenCalledWith(token);
    });
  });

  describe("deleteSessionsEndedBy", () => {
    // The time is the caller's cutoff, not now: a session's rows are kept as
    // a record after it ends, and go only once it ended that long ago. The
    // tokens are not named here. The foreign key deletes them with their
    // session.
    it("deletes the sessions that ended at or before the time it is given", async () => {
      const cutoff = "2026-04-14T12:00:00.000Z";

      await repository.deleteSessionsEndedBy(cutoff);

      expect(sessions.delete).toHaveBeenCalledWith({ expiresAt: LessThanOrEqual(cutoff) });
    });
  });

  describe("findToken", () => {
    const session = { id: sessionId, userId: 25, expiresAt: "2026-11-10T12:00:00.000Z" };

    it("looks the token up by its hash, with its session and the session's member", async () => {
      refreshTokens.find.mockResolvedValue([]);

      await repository.findToken(hash);

      expect(refreshTokens.find).toHaveBeenCalledWith({
        where: { id: hash },
        relations: { session: { user: true } },
      });
    });

    it("returns the token, its session, and the member's id and username", async () => {
      const user = { id: 25, username: "walter", email: "walter@example.com" };
      const token = { id: hash, sessionId, session: { ...session, user } };
      refreshTokens.find.mockResolvedValue([token]);

      await expect(repository.findToken(hash)).resolves.toEqual({
        token,
        session: token.session,
        member: { id: 25, username: "walter" },
      });
    });

    // TypeORM leaves a soft-deleted user out of a join, so the session comes
    // back with no user.
    it("returns no member when the account is closed", async () => {
      const token = { id: hash, sessionId, session: { ...session, user: null } };
      refreshTokens.find.mockResolvedValue([token]);

      await expect(repository.findToken(hash)).resolves.toMatchObject({ member: null });
    });

    it("answers null for a hash no row has", async () => {
      refreshTokens.find.mockResolvedValue([]);

      await expect(repository.findToken(hash)).resolves.toBeNull();
    });
  });

  describe("markTokenUsed", () => {
    // The condition is the point: only a row that is still unused is
    // touched, so two requests cannot both win.
    it("updates only a row that is not used yet", async () => {
      refreshTokens.update.mockResolvedValue({ affected: 1 });

      await repository.markTokenUsed(hash, now);

      expect(refreshTokens.update).toHaveBeenCalledWith(
        { id: hash, usedAt: IsNull() },
        { usedAt: now },
      );
    });

    it("answers true when this call marked it", async () => {
      refreshTokens.update.mockResolvedValue({ affected: 1 });

      await expect(repository.markTokenUsed(hash, now)).resolves.toBe(true);
    });

    it("answers false when the row was used already, or is not there", async () => {
      refreshTokens.update.mockResolvedValue({ affected: 0 });

      await expect(repository.markTokenUsed(hash, now)).resolves.toBe(false);
    });
  });

  describe("revokeSession", () => {
    // Two conditions beside the id. "Not ended yet" keeps the time of the
    // first ending when a session is ended twice. "Not past its end" leaves a
    // session that ran out by itself as it was: its row is a record, and
    // marking it would say somebody ended it.
    it("marks the session ended now, only if it is still going", async () => {
      await repository.revokeSession(sessionId, now);

      expect(sessions.update).toHaveBeenCalledWith(
        { id: sessionId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
        { revokedAt: now },
      );
    });
  });

  describe("revokeSessionsOfUser", () => {
    it("marks the member's sessions that are still going as ended now", async () => {
      await repository.revokeSessionsOfUser(25, now);

      expect(sessions.update).toHaveBeenCalledWith(
        { userId: 25, revokedAt: IsNull(), expiresAt: MoreThan(now) },
        { revokedAt: now },
      );
    });

    // A password change passes its transaction's manager, so the new
    // password and the end of the old sessions commit or roll back together.
    it("writes through the caller's manager when it is given one", async () => {
      const inTransaction = { update: vi.fn() };
      const manager = { getRepository: vi.fn(() => inTransaction) };

      await repository.revokeSessionsOfUser(25, now, manager as unknown as EntityManager);

      expect(manager.getRepository).toHaveBeenCalledWith(Session);
      expect(inTransaction.update).toHaveBeenCalledWith(
        { userId: 25, revokedAt: IsNull(), expiresAt: MoreThan(now) },
        { revokedAt: now },
      );
      expect(sessions.update).not.toHaveBeenCalled();
    });
  });

  describe("isSessionLive", () => {
    // One lookup by primary key, with the two things that make a session
    // over as its conditions.
    it("asks for that session, not ended and not past its end", async () => {
      sessions.existsBy.mockResolvedValue(true);

      await repository.isSessionLive(sessionId, now);

      expect(sessions.existsBy).toHaveBeenCalledWith({
        id: sessionId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      });
    });

    it("is live when such a row exists", async () => {
      sessions.existsBy.mockResolvedValue(true);

      await expect(repository.isSessionLive(sessionId, now)).resolves.toBe(true);
    });

    // No row at all, a row that was ended, or one past its end: the same
    // answer for all three.
    it("is not live when no such row exists", async () => {
      sessions.existsBy.mockResolvedValue(false);

      await expect(repository.isSessionLive(sessionId, now)).resolves.toBe(false);
    });
  });
});
