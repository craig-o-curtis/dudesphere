import { splitCommaSeparated } from "./comma-separated.js";

describe("splitCommaSeparated", () => {
  it("returns one value for a string with no comma", () => {
    expect(splitCommaSeparated("dude")).toEqual(["dude"]);
  });

  it("splits on commas and trims each value", () => {
    expect(splitCommaSeparated("dude, sunday ,walter")).toEqual(["dude", "sunday", "walter"]);
  });

  it("drops the empty parts", () => {
    expect(splitCommaSeparated("a,, b ,")).toEqual(["a", "b"]);
  });

  it("returns nothing for a string of only commas and spaces", () => {
    expect(splitCommaSeparated(" , , ")).toEqual([]);
    expect(splitCommaSeparated("")).toEqual([]);
  });
});
