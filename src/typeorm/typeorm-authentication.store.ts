import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type RefreshTokenRecord,
  type RefreshTokenStore,
  type SessionRecord,
  type SessionStore,
} from "@nestjs/authentication";
import { Inject, Injectable } from "@nestjs/common";
import {
  DataSource,
  type EntityTarget,
  type FindOptionsWhere,
  IsNull,
  LessThan,
  LessThanOrEqual,
  type ObjectLiteral,
} from "typeorm";

import { isoToDate, normalizeDateToISO } from "../shared/utils/iso-timestamp-transformer.js";
import {
  EmailTokenEntity,
  type Json,
  RefreshTokenEntity,
  SessionEntity,
} from "./authentication.entities.js";

// A time as the package passes it: a JavaScript Date. Named through the
// package's own record type, because the app never names Date itself (the
// gmt lint rules). The store turns it into an ISO string straight away.
type PackageDate = SessionRecord["createdAt"];

/**
 * Keeps the state of @nestjs/authentication in PostgreSQL, through TypeORM:
 * the docs' TypeOrmAuthenticationStore, from "Keep sessions and tokens in
 * your database" on https://docs.nestjs.com/security/authentication.
 *
 * It implements the three contracts this app uses: sessions, refresh tokens
 * and email links. Every method that decides whether something works once is
 * a single conditional statement, so the guarantees hold with any number of
 * API instances.
 *
 * One change from the docs: the package's records carry Date objects, and
 * the tables hold ISO strings, as every table in this app does. The
 * conversion happens here and nowhere else. See authentication.entities.ts.
 */
@Injectable()
export class TypeOrmAuthenticationStore
  implements SessionStore, RefreshTokenStore, EmailTokenStore
{
  /** Pending email links kept: anyone can ask for one. */
  protected readonly maxPending: number = 100_000;

  constructor(
    // @Inject names each token outright, because `pnpm seed:run` builds the
    // whole app through tsx, which emits no constructor types.
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(AuthenticationStorage) storage: AuthenticationStorage,
  ) {
    storage.registerSource({
      sessions: this,
      refreshTokens: this,
      emailTokens: this,
    });
  }

  private get manager() {
    return this.dataSource.manager;
  }

  // Sessions

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = await this.manager.findOneBy(SessionEntity, { id });
    return row ? toSessionRecord(row) : undefined;
  }

  async createSession(record: SessionRecord): Promise<void> {
    // JSON-safe: the package stores what `session.metadata` returned, as JSON.
    const metadata = (record.metadata ?? null) as Record<string, Json> | null;
    await this.manager.insert(SessionEntity, {
      id: record.id,
      userId: record.userId,
      createdAt: iso(record.createdAt),
      expiresAt: iso(record.expiresAt),
      lastActiveAt: iso(record.lastActiveAt),
      mfa: record.mfa ?? null,
      metadata,
    });
    await this.manager.delete(SessionEntity, { expiresAt: LessThanOrEqual(iso(record.createdAt)) });
  }

  async touchSession(id: string, lastActiveAt: PackageDate): Promise<void> {
    // Conditional: a session deleted by a sign-out stays deleted.
    const at = iso(lastActiveAt);
    await this.manager.update(
      SessionEntity,
      { id, lastActiveAt: LessThan(at) },
      { lastActiveAt: at },
    );
  }

  // Whether this call deleted it: of two rotations of a session, or a rotation and a sign-out, one wins.
  async deleteSession(id: string): Promise<boolean> {
    const { affected } = await this.manager.delete(SessionEntity, { id });
    return (affected ?? 0) > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.manager.findBy(SessionEntity, { userId });
    return rows.map(toSessionRecord);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.manager.delete(SessionEntity, { userId });
  }

  // Refresh tokens

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.manager.findOneBy(RefreshTokenEntity, { id });
    return row ? toRefreshTokenRecord(row) : undefined;
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    const claims = (record.claims ?? null) as Record<string, Json> | null;
    await this.manager.insert(RefreshTokenEntity, {
      id: record.id,
      familyId: record.familyId,
      userId: record.userId,
      createdAt: iso(record.createdAt),
      expiresAt: iso(record.expiresAt),
      familyExpiresAt: iso(record.familyExpiresAt),
      usedAt: record.usedAt ? iso(record.usedAt) : null,
      claims,
    });
    // A family past its absolute limit can never refresh again, revoked or
    // not, so its rows go as new ones are written.
    await this.manager.delete(RefreshTokenEntity, {
      familyExpiresAt: LessThanOrEqual(iso(record.createdAt)),
    });
  }

  async markRefreshTokenUsed(id: string, at: PackageDate): Promise<boolean> {
    // Conditional: of two refreshes with the same token, one updates the row.
    const { affected } = await this.manager.update(
      RefreshTokenEntity,
      { id, usedAt: IsNull() },
      { usedAt: iso(at) },
    );
    return affected === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.manager.update(RefreshTokenEntity, { familyId }, { revoked: true });
  }

  isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return this.manager.existsBy(RefreshTokenEntity, { familyId, revoked: true });
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.manager.update(RefreshTokenEntity, { userId }, { revoked: true });
  }

  // Password reset and email verification links

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.manager.insert(EmailTokenEntity, {
      id: record.id,
      purpose: record.purpose,
      userId: record.userId,
      email: record.email,
      fingerprint: record.fingerprint ?? null,
      createdAt: iso(record.createdAt),
      expiresAt: iso(record.expiresAt),
    });
    await this.trim(EmailTokenEntity, iso(record.createdAt));
  }

  async consumeEmailToken(
    id: string,
    purpose: EmailTokenPurpose,
  ): Promise<EmailTokenRecord | undefined> {
    // DELETE … RETURNING: of two requests with the same link, one gets the row.
    const [row] = await this.deleteReturning(EmailTokenEntity, { id, purpose });
    return row && toEmailTokenRecord(row);
  }

  async deleteUserEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.manager.delete(EmailTokenEntity, { userId, purpose });
  }

  /**
   * `DELETE … RETURNING *`, as rows of the entity. The query builder returns
   * raw column names and raw values, so this maps each column back to its
   * property and runs its transformer, which turns a timestamp into the ISO
   * string a find() would have returned.
   */
  private async deleteReturning<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    where: FindOptionsWhere<T>,
  ): Promise<T[]> {
    const { raw } = await this.manager
      .createQueryBuilder()
      .delete()
      .from(entity)
      .where(where)
      .returning("*")
      .execute();
    const columns = this.dataSource.getMetadata(entity).columns;
    return (raw as Record<string, unknown>[]).map(
      (row) =>
        Object.fromEntries(
          columns.map((column) => {
            const value = row[column.databaseName];
            const { transformer } = column;
            return [
              column.propertyName,
              transformer && !Array.isArray(transformer) ? transformer.from(value) : value,
            ];
          }),
        ) as T,
    );
  }

  /** Deletes what expired, and past `maxPending`, what expires first. */
  private async trim<T extends { expiresAt: string }>(entity: EntityTarget<T>, now: string) {
    await this.manager.delete(entity, { expiresAt: LessThanOrEqual(now) } as FindOptionsWhere<T>);
    const [cutoff] = await this.manager.find(entity, {
      select: { expiresAt: true } as never,
      order: { expiresAt: "DESC" } as never,
      skip: this.maxPending,
      take: 1,
    });
    if (cutoff) {
      await this.manager.delete(entity, {
        expiresAt: LessThanOrEqual(cutoff.expiresAt),
      } as FindOptionsWhere<T>);
    }
  }
}

// From the package's date to the ISO string the tables hold.
function iso(date: PackageDate): string {
  return normalizeDateToISO(date) as string;
}

// From a row to the package's record. An optional field the row holds as
// NULL is left out, not set to undefined: the package's records leave
// optional fields out.

function toSessionRecord(row: SessionEntity): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: isoToDate(row.createdAt),
    expiresAt: isoToDate(row.expiresAt),
    lastActiveAt: isoToDate(row.lastActiveAt),
    ...(row.mfa !== null ? { mfa: row.mfa } : {}),
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
  };
}

function toRefreshTokenRecord(row: RefreshTokenEntity): RefreshTokenRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    userId: row.userId,
    createdAt: isoToDate(row.createdAt),
    expiresAt: isoToDate(row.expiresAt),
    familyExpiresAt: isoToDate(row.familyExpiresAt),
    ...(row.usedAt !== null ? { usedAt: isoToDate(row.usedAt) } : {}),
    ...(row.claims !== null ? { claims: row.claims } : {}),
  };
}

function toEmailTokenRecord(row: EmailTokenEntity): EmailTokenRecord {
  return {
    id: row.id,
    purpose: row.purpose,
    userId: row.userId,
    email: row.email,
    ...(row.fingerprint !== null ? { fingerprint: row.fingerprint } : {}),
    createdAt: isoToDate(row.createdAt),
    expiresAt: isoToDate(row.expiresAt),
  };
}
