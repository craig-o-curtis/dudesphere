import { Policy, type PolicyBefore } from "@nestjs/authorization";

import { type User, UserRole } from "./user.entity.js";

/**
 * Who may manage other members' accounts: admins only.
 *
 * Every ability denies, and before() lets admins through, as the docs'
 * "Let admins through with before()" shows. A member's own account is not
 * here: the /users/me routes are @Can.Anyone(), and they act on the caller.
 * GET /users/:id is @Can.Anyone() too, and UsersService.getUserForCaller
 * lets a member read only their own row.
 *
 * `null` is a guest. Authentication refuses guests on these routes before
 * any policy runs, so in practice the user is always there.
 */
@Policy()
export class UserPolicy implements PolicyBefore<User> {
  before(user: User | null) {
    if (user?.role === UserRole.ADMIN) {
      return true;
    }
  }

  viewAll(_user: User | null) {
    return false;
  }

  create(_user: User | null) {
    return false;
  }

  update(_user: User | null) {
    return false;
  }

  delete(_user: User | null) {
    return false;
  }

  restore(_user: User | null) {
    return false;
  }
}
