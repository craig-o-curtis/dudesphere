import { isValidUtc } from "@northguild/gmt";

import { ClockUnavailableException } from "../exceptions/clock-unavailable.exception.js";
import { orClockUnavailable, utcNowOrThrow } from "./utc-clock.js";

describe("the UTC clock helpers", () => {
  describe("utcNowOrThrow", () => {
    it("returns the current time as a UTC instant", () => {
      expect(isValidUtc(utcNowOrThrow())).toBe(true);
    });
  });

  describe("orClockUnavailable", () => {
    it("hands a time back as it came", () => {
      expect(orClockUnavailable("2026-10-11T12:00:00Z")).toBe("2026-10-11T12:00:00Z");
    });

    // "" is what gmt returns when it cannot read the clock or do the sum, and
    // null is what minUtc returns for a list it cannot use.
    it.each([
      ["an empty string", ""],
      ["null", null],
    ])("throws 503 CLOCK_UNAVAILABLE for %s", (_what, value) => {
      function attempt() {
        return orClockUnavailable(value);
      }

      expect(attempt).toThrow(ClockUnavailableException);
      expect(attempt).toThrow(expect.objectContaining({ errorCode: "CLOCK_UNAVAILABLE" }));
    });
  });
});
