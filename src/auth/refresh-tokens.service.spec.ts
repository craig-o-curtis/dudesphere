import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { type EntityManager, IsNull, LessThanOrEqual } from "typeorm";

import { RefreshToken } from "./refresh-token.entity.js";
import { RefreshTokensService } from "./refresh-tokens.service.js";

// These cases cover what each method asks the database and what it makes of
// the answer. test/tokens.e2e-spec.ts runs the statements against the real
// database: the one-winner UPDATE, the session check, and the clearing out
// of sessions that have run out.
describe("RefreshTokensService", () => {
  let service: RefreshTokensService;

  const repository = {
    insert: vi.fn(),
    delete: vi.fn(),
    findOneBy: vi.fn(),
    update: vi.fn(),
    existsBy: vi.fn(),
    // isSessionLive sends one statement of its own and reads one row back.
    query: vi.fn(),
  };

  const now = "2026-10-11T12:00:00.000Z";
  const hash = "a".repeat(64);
  const familyId = "0b9f6d1e-6f0c-4a3e-9d55-2f1f6f0f7a10";

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokensService,
        { provide: getRepositoryToken(RefreshToken), useValue: repository },
      ],
    }).compile();

    service = module.get(RefreshTokensService);
  });

  describe("save", () => {
    const token = {
      id: hash,
      familyId,
      userId: 25,
      expiresAt: "2026-10-18T12:00:00.000Z",
      familyExpiresAt: "2026-11-10T12:00:00.000Z",
    };

    it("inserts the row as given", async () => {
      await service.save(token, now);

      expect(repository.insert).toHaveBeenCalledWith(token);
    });

    // The table's only housekeeping. Without it the rows of every session
    // that ever ran out would stay for good.
    it("then clears out the sessions that have run out", async () => {
      await service.save(token, now);

      expect(repository.delete).toHaveBeenCalledWith({ familyExpiresAt: LessThanOrEqual(now) });
    });
  });

  describe("find", () => {
    it("looks the row up by the token's hash", async () => {
      const row = { id: hash, familyId, userId: 25 };
      repository.findOneBy.mockResolvedValue(row);

      await expect(service.find(hash)).resolves.toBe(row);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: hash });
    });

    it("answers null for a hash no row has", async () => {
      repository.findOneBy.mockResolvedValue(null);

      await expect(service.find(hash)).resolves.toBeNull();
    });
  });

  describe("markUsed", () => {
    // The condition is the point: only a row that is still unused is
    // touched, so two requests cannot both win.
    it("updates only a row that is not used yet", async () => {
      repository.update.mockResolvedValue({ affected: 1 });

      await service.markUsed(hash, now);

      expect(repository.update).toHaveBeenCalledWith(
        { id: hash, usedAt: IsNull() },
        { usedAt: now },
      );
    });

    it("answers true when this call marked it", async () => {
      repository.update.mockResolvedValue({ affected: 1 });

      await expect(service.markUsed(hash, now)).resolves.toBe(true);
    });

    it("answers false when the row was used already, or is not there", async () => {
      repository.update.mockResolvedValue({ affected: 0 });

      await expect(service.markUsed(hash, now)).resolves.toBe(false);
    });
  });

  describe("revokeFamily", () => {
    it("marks every row of the session revoked", async () => {
      await service.revokeFamily(familyId);

      expect(repository.update).toHaveBeenCalledWith({ familyId }, { revoked: true });
    });
  });

  describe("isFamilyRevoked", () => {
    it("is true as soon as one row of the session is revoked", async () => {
      repository.existsBy.mockResolvedValue(true);

      await expect(service.isFamilyRevoked(familyId)).resolves.toBe(true);
      expect(repository.existsBy).toHaveBeenCalledWith({ familyId, revoked: true });
    });
  });

  describe("revokeAllForUser", () => {
    it("marks every row of the member revoked", async () => {
      await service.revokeAllForUser(25);

      expect(repository.update).toHaveBeenCalledWith({ userId: 25 }, { revoked: true });
    });

    // A password change passes its transaction's manager, so the new
    // password and the end of the old sessions commit or roll back together.
    it("writes through the caller's manager when it is given one", async () => {
      const inTransaction = { update: vi.fn() };
      const manager = { getRepository: vi.fn(() => inTransaction) };

      await service.revokeAllForUser(25, manager as unknown as EntityManager);

      expect(manager.getRepository).toHaveBeenCalledWith(RefreshToken);
      expect(inTransaction.update).toHaveBeenCalledWith({ userId: 25 }, { revoked: true });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("isSessionLive", () => {
    // One statement, with the session and the time as its two parameters.
    // It asks two things: is any row of the session not past its end, and is
    // any row revoked.
    it("asks about that session at that time, in one statement", async () => {
      repository.query.mockResolvedValue([{ going: true, revoked: false }]);

      await service.isSessionLive(familyId, now);

      expect(repository.query).toHaveBeenCalledTimes(1);
      const [sql, parameters] = repository.query.mock.calls[0] as [string, unknown[]];
      expect(parameters).toEqual([familyId, now]);
      expect(sql).toContain(`"familyExpiresAt" > $2`);
      expect(sql).toContain(`"revoked" = true`);
    });

    it("is live when the session is still going and no row is revoked", async () => {
      repository.query.mockResolvedValue([{ going: true, revoked: false }]);

      await expect(service.isSessionLive(familyId, now)).resolves.toBe(true);
    });

    it("is not live when any row is revoked", async () => {
      repository.query.mockResolvedValue([{ going: true, revoked: true }]);

      await expect(service.isSessionLive(familyId, now)).resolves.toBe(false);
    });

    // A session that never existed, or one that has passed its end: no row
    // answers the first question either way.
    it("is not live when no row of the session is inside its time", async () => {
      repository.query.mockResolvedValue([{ going: false, revoked: false }]);

      await expect(service.isSessionLive(familyId, now)).resolves.toBe(false);
    });
  });
});
