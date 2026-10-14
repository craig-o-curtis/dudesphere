import { Policy } from "@nestjs/authorization";

import { type User, UserRole } from "../users/user.entity.js";

/**
 * Who may manage hashtags: admins only. Anyone may read them, so the read
 * routes are @Public() and need no ability here.
 *
 * `null` is a guest. Authentication refuses guests on these routes before
 * any policy runs.
 */
@Policy()
export class HashtagPolicy {
  delete(user: User | null) {
    return user?.role === UserRole.ADMIN;
  }

  restore(user: User | null) {
    return user?.role === UserRole.ADMIN;
  }
}
