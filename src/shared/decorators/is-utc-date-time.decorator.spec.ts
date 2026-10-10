import { IsOptional, validateSync } from "class-validator";

import { IsUtcDateTime } from "./is-utc-date-time.decorator.js";

class Sample {
  @IsUtcDateTime()
  value: unknown;
}

function messagesFor(value: unknown): string[] {
  const sample = Object.assign(new Sample(), { value });
  return validateSync(sample).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe("IsUtcDateTime", () => {
  it.each([
    "2026-10-06T12:00:00Z",
    "2026-10-06T12:00:00.000Z",
    "2026-10-06T12:00:00.123456Z",
    // Nine digits is the most an instant carries: nanoseconds.
    "2026-10-06T12:00:00.123456789Z",
    // The first and last moments of a day.
    "2026-10-06T00:00:00Z",
    "2026-10-06T23:59:59.999Z",
    // 2024 is a leap year, so this day exists.
    "2024-02-29T00:00:00Z",
  ])("accepts %s", (value) => {
    expect(messagesFor(value)).toEqual([]);
  });

  it.each([
    ["a day that does not exist", "2026-02-30T00:00:00Z"],
    ["29 February in a year that is not a leap year", "2026-02-29T00:00:00Z"],
    ["a date with no time", "2026-10-06"],
    ["a year alone", "2026"],
    ["a week date", "2026-W12"],
    ["an offset other than Z", "2026-10-06T12:00:00+03:00"],
    ["no offset at all", "2026-10-06T12:00:00"],
    // UTC, but not written with Z. One instant gets one spelling.
    ["a zero offset written out", "2026-10-06T12:00:00+00:00"],
    ["a lower-case z", "2026-10-06T12:00:00z"],
    ["a lower-case t", "2026-10-06t12:00:00Z"],
    ["a space in place of the T", "2026-10-06 12:00:00Z"],
    ["no separators", "20261006T120000Z"],
    ["a time with no seconds", "2026-10-06T12:00Z"],
    ["month 13", "2026-13-01T00:00:00Z"],
    ["day 0", "2026-10-00T00:00:00Z"],
    ["hour 24", "2026-10-06T24:00:00Z"],
    ["minute 60", "2026-10-06T12:60:00Z"],
    ["ten fraction digits", "2026-10-06T12:00:00.1234567890Z"],
    ["a time zone annotation", "2026-10-06T12:00:00Z[Europe/Paris]"],
    ["a comma before the fraction", "2026-10-06T12:00:00,5Z"],
    ["a year Postgres cannot hold", "-005000-01-01T00:00:00Z"],
    ["a year written with six digits", "+002026-10-06T12:00:00Z"],
    ["a leap second", "2016-12-31T23:59:60Z"],
    ["an empty string", ""],
    // A value copied with stray whitespace is not trimmed for the caller.
    ["a leading space", " 2026-10-06T12:00:00Z"],
    ["a trailing space", "2026-10-06T12:00:00Z "],
    ["a trailing line break", "2026-10-06T12:00:00Z\n"],
    ["a number", 20261006],
    ["a boolean", true],
    ["an object", {}],
    // ?startDate=a&startDate=b reaches a DTO as an array.
    ["an array holding a valid value", ["2026-10-06T12:00:00Z"]],
    ["null", null],
    ["a missing value", undefined],
  ])("rejects %s", (_what, value) => {
    expect(messagesFor(value)).toEqual([
      "value must be a UTC date-time such as 2026-10-06T12:00:00Z",
    ]);
  });

  it("names the field it is on in its message", () => {
    class Range {
      @IsUtcDateTime()
      startDate: unknown;
    }
    const range = Object.assign(new Range(), { startDate: "yesterday" });

    const [error] = validateSync(range);

    expect(Object.values(error.constraints ?? {})).toEqual([
      "startDate must be a UTC date-time such as 2026-10-06T12:00:00Z",
    ]);
  });

  it("uses the caller's own message when given one", () => {
    class Custom {
      @IsUtcDateTime({ message: "pick a real instant" })
      value: unknown;
    }
    const custom = Object.assign(new Custom(), { value: "yesterday" });

    const [error] = validateSync(custom);

    expect(Object.values(error.constraints ?? {})).toEqual(["pick a real instant"]);
  });

  // The decorator alone refuses a missing value. A field that may be left
  // out pairs it with @IsOptional, as GetAbidingsDto does for its two dates.
  it("lets a missing value through on a field marked @IsOptional", () => {
    class Optional {
      @IsOptional()
      @IsUtcDateTime()
      value?: unknown;
    }

    expect(validateSync(new Optional())).toEqual([]);
    expect(validateSync(Object.assign(new Optional(), { value: "yesterday" }))).toHaveLength(1);
  });
});
