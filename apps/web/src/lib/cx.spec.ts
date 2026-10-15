import { cx } from "./cx";

describe("cx", () => {
  it("joins names with a space, in order", () => {
    expect(cx("a", "b", "c")).toBe("a b c");
  });

  it("drops false, null, undefined and empty strings", () => {
    expect(cx("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("returns an empty string when nothing is left", () => {
    expect(cx(false, null, undefined, "")).toBe("");
  });
});
