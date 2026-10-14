import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import { utcNowOrThrow } from "../shared/utils/utc-clock.js";
import { RefreshTokenEntity, SessionEntity } from "./authentication.entities.js";

/**
 * The app's own questions about sign-ins, beside the package's store.
 *
 * Two things the package does not do, and the NestJS docs do not ask for:
 *
 * - `isLive` lets JwtAuth refuse an access token whose sign-in was ended,
 *   on the very next request. The package only ends refresh tokens.
 * - `endAllForUser` ends every sign-in of a member inside the caller's
 *   transaction, so a password change and the end of its sign-ins are saved
 *   together or not at all. The package's revokeAll calls run on their own.
 *
 * It imports no app module, so UsersModule and AuthModule can both use it.
 */
@Injectable()
export class SignInsRepository {
  // @Inject names the token outright, because `pnpm seed:run` builds the
  // whole app through tsx, which emits no constructor types.
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  /**
   * Whether the sign-in with this `sid` is still going: it has rows, none of
   * them is revoked, and its family's end is still ahead. One read, on
   * refresh_tokens_sid_idx.
   *
   * Any revoked row counts. The store marks every row of a family revoked,
   * and a successor saved a moment later is caught by its older rows.
   *
   * A sign-in whose rows were deleted, because its family's end passed, has
   * no rows and is not live.
   */
  async isLive(sid: string): Promise<boolean> {
    const [row] = (await this.dataSource.query(
      `SELECT coalesce(bool_and(NOT revoked) AND max(family_expires_at) > $2, false) AS live
       FROM refresh_tokens
       WHERE sid = $1`,
      [sid, utcNowOrThrow()],
    )) as [{ live: boolean }];
    return row.live;
  }

  /**
   * Ends every sign-in of a member, through the caller's transaction: every
   * refresh token is marked revoked, and every browser session deleted.
   * The same two writes as the package's TokenService.revokeAll and
   * SessionService.revokeAll, which cannot join a transaction.
   */
  async endAllForUser(userId: number, manager: EntityManager): Promise<void> {
    const id = String(userId);
    await manager.update(RefreshTokenEntity, { userId: id }, { revoked: true });
    await manager.delete(SessionEntity, { userId: id });
  }
}
