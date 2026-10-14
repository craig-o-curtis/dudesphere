import { type User, UserRole } from "../users/user.entity.js";
import { HashtagPolicy } from "./hashtag.policy.js";

// The rule behind @Can(HashtagPolicy, ...) on the hashtag write routes. A
// policy is a plain class, so these call it directly, with no guard. The
// guard's part, a 403 over HTTP, is in test/hashtags.e2e-spec.ts.
describe("HashtagPolicy", () => {
  const policy = new HashtagPolicy();

  // The user AuthenticationModule's guard puts on the request: the User row
  // JwtAuth loads, without the password hash, as UsersRepository returns it.
  function member(id: number, username: string, role: UserRole): User {
    return {
      id,
      username,
      email: `${username}@example.com`,
      role,
      passwordChangedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    } as User;
  }

  const admin = member(9, "maude", UserRole.ADMIN);
  const user = member(2, "donny", UserRole.USER);

  describe.each(["delete", "restore"] as const)("%s", (ability) => {
    it("allows an admin", () => {
      expect(policy[ability](admin)).toBe(true);
    });

    it("refuses a member who is not an admin", () => {
      expect(policy[ability](user)).toBe(false);
    });

    // A guest. Authentication refuses one on these routes first, but the
    // policy must still say no if it ever gets one.
    it("refuses a guest", () => {
      expect(policy[ability](null)).toBe(false);
    });
  });
});
