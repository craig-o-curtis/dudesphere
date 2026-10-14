import { type User, UserRole } from "./user.entity.js";
import { UserPolicy } from "./user.policy.js";

// The policy is plain code, so it is tested on its own. Whether a route
// really asks it, and turns false into a 403, is for the e2e tests.
describe("UserPolicy", () => {
  const policy = new UserPolicy();

  const admin = { id: 1, username: "admin", role: UserRole.ADMIN } as User;
  const dude = { id: 25, username: "dude", role: UserRole.USER } as User;

  const abilities = ["viewAll", "create", "update", "delete", "restore"] as const;

  // before() answers first. true lets the caller through without asking the
  // ability.
  it("lets an admin through in before()", () => {
    expect(policy.before(admin)).toBe(true);
  });

  // undefined, not false: before() has no say for anyone else, so the
  // ability decides.
  it.each([
    ["a member", dude],
    ["a guest", null],
  ])("leaves %s to the ability in before()", (_who, user) => {
    expect(policy.before(user)).toBeUndefined();
  });

  describe.each(abilities)("%s", (ability) => {
    it.each([
      ["a member", dude],
      ["a guest", null],
    ])("refuses %s", (_who, user) => {
      expect(policy[ability](user)).toBe(false);
    });
  });
});
