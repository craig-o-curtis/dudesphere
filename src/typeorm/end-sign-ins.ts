import type { EntityManager } from "typeorm";

import { RefreshTokenEntity, SessionEntity } from "./authentication.entities.js";

// The two writes that end every sign-in of a member. The package's
// TokenService.revokeAll and SessionService.revokeAll reach them through the
// store, on the store's own manager. SignInsRepository.endAllForUser runs
// them on the caller's manager, so they join the caller's transaction.
//
// One copy, so the two paths cannot drift apart. sign-ins.repository.spec.ts
// checks that the package's revokeAll calls still reach only these two.

/** Marks every refresh token of the member revoked. */
export async function revokeUserRefreshTokens(
  manager: EntityManager,
  userId: string,
): Promise<void> {
  await manager.update(RefreshTokenEntity, { userId }, { revoked: true });
}

/** Deletes every browser session of the member. */
export async function deleteUserSessions(manager: EntityManager, userId: string): Promise<void> {
  await manager.delete(SessionEntity, { userId });
}
