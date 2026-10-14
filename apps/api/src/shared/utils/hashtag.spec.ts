import { describe, expect, it } from "vitest";

import { extractHashtagDisplays, extractHashtags, normalizeHashtag } from "./hashtag.js";

describe("extractHashtags", () => {
  it("extracts one tag", () => {
    expect(extractHashtags("Taking it easy #Sunday")).toEqual(["sunday"]);
  });

  it("extracts several tags", () => {
    expect(extractHashtags("Taking it easy #Sunday #Dude")).toEqual(["sunday", "dude"]);
  });

  it("returns an empty array for no tags", () => {
    expect(extractHashtags("Taking it easy")).toEqual([]);
  });

  it("lowercases tags so casing never splits a tag", () => {
    expect(extractHashtags("#Sunday #SUNDAY")).toEqual(["sunday"]);
  });

  it("deduplicates repeated tags", () => {
    expect(extractHashtags("#dude #Dude #DUDE")).toEqual(["dude"]);
  });

  it("keeps unicode letters", () => {
    expect(extractHashtags("#señor #日本")).toEqual(["señor", "日本"]);
  });

  it("stops at punctuation", () => {
    expect(extractHashtags("#dude.")).toEqual(["dude"]);
    expect(extractHashtags("#dude's")).toEqual(["dude"]);
  });

  it("ignores a bare # and a # followed by a space", () => {
    expect(extractHashtags("# dude")).toEqual([]);
    expect(extractHashtags("#")).toEqual([]);
  });

  it("drops a tag over 64 characters", () => {
    const longTag = "a".repeat(65);
    expect(extractHashtags(`#${longTag}`)).toEqual([]);
  });

  it("caps at 10 tags", () => {
    const message = Array.from({ length: 15 }, (_, i) => `#tag${i}`).join(" ");
    expect(extractHashtags(message)).toHaveLength(10);
  });
});

describe("extractHashtagDisplays", () => {
  it("maps each slug to the casing it was written with", () => {
    expect(extractHashtagDisplays("Taking it easy #Sunday #DUDE")).toEqual(
      new Map([
        ["sunday", "Sunday"],
        ["dude", "DUDE"],
      ]),
    );
  });

  it("keeps the first casing when a tag repeats", () => {
    expect(extractHashtagDisplays("#Dude then #dude then #DUDE")).toEqual(
      new Map([["dude", "Dude"]]),
    );
  });

  it("applies the same length cap and tag cap as extractHashtags", () => {
    expect(extractHashtagDisplays(`#${"a".repeat(65)}`)).toEqual(new Map());

    const message = Array.from({ length: 15 }, (_, i) => `#tag${i}`).join(" ");
    expect(extractHashtagDisplays(message).size).toBe(10);
  });

  it("returns an empty map for a message with no tags", () => {
    expect(extractHashtagDisplays("Taking it easy")).toEqual(new Map());
  });

  // The two functions must agree, or an abiding could carry a tag the
  // registry never hears about.
  it("has the same keys as extractHashtags for the same message", () => {
    const message = "#Sunday #dude #Sunday #señor";
    expect([...extractHashtagDisplays(message).keys()]).toEqual(extractHashtags(message));
  });
});

describe("normalizeHashtag", () => {
  it("accepts input with a leading #", () => {
    expect(normalizeHashtag("#Sunday")).toBe("sunday");
  });

  it("accepts input without a leading #", () => {
    expect(normalizeHashtag("Sunday")).toBe("sunday");
  });

  it("returns null for junk input", () => {
    expect(normalizeHashtag("")).toBeNull();
    expect(normalizeHashtag("#")).toBeNull();
    expect(normalizeHashtag("dude!")).toBeNull();
    expect(normalizeHashtag("a".repeat(65))).toBeNull();
  });
});
