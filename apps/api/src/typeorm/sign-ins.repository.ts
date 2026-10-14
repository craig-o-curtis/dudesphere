import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import { utcNowOrThrow } from "../shared/utils/utc-clock.js";
import { deleteUserSessions, revokeUserRefreshTokens } from "./end-sign-ins.js";

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
   * Whether the sign-in with this `sid` is still going for this member: it
   * has a row of theirs whose family's end is still ahead, and no row of it
   * is revoked.
   *
   * Two checks, each stopping at the first row it finds. A sign-in gains a
   * row on every refresh, so reading all of them would get slower the longer
   * it lasts.
   * - The first EXISTS uses refresh_tokens_sid_idx. Every row of a family
   *   shares its member and its end, so the first row found answers it.
   * - The NOT EXISTS uses refresh_tokens_revoked_sid_idx, which holds only
   *   revoked rows. For a sign-in still going it finds none at once.
   *
   * Any revoked row counts. The store marks every row of a family revoked,
   * and a successor saved a moment later is caught by its older rows.
   *
   * A sign-in whose rows were deleted, because its family's end passed, has
   * no rows and is not live. So is a `sid` from another member's sign-in.
   */
  async isLive(sid: string, userId: string): Promise<boolean> {
    const [row] = (await this.dataSource.query(
      `SELECT EXISTS (
                SELECT 1 FROM refresh_tokens
                WHERE sid = $1 AND user_id = $2 AND family_expires_at > $3
              )
          AND NOT EXISTS (
                SELECT 1 FROM refresh_tokens WHERE sid = $1 AND revoked
              ) AS live`,
      [sid, userId, utcNowOrThrow()],
    )) as [{ live: boolean }];
    return row.live;
  }

  /**
   * Ends every sign-in of a member, through the caller's transaction: every
   * refresh token is marked revoked, and every browser session deleted.
   * The same two writes as the package's TokenService.revokeAll and
   * SessionService.revokeAll, which cannot join a transaction: both paths
   * run the functions in end-sign-ins.ts.
   */
  async endAllForUser(userId: number, manager: EntityManager): Promise<void> {
    const id = String(userId);
    await revokeUserRefreshTokens(manager, id);
    await deleteUserSessions(manager, id);
  }
}
