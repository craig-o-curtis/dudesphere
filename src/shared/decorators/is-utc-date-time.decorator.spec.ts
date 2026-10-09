import { validateSync } from "class-validator";

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
    ["a lower-case z", "2026-10-06T12:00:00z"],
    ["a space in place of the T", "2026-10-06 12:00:00Z"],
    ["a time zone annotation", "2026-10-06T12:00:00Z[Europe/Paris]"],
    ["a comma before the fraction", "2026-10-06T12:00:00,5Z"],
    ["a year Postgres cannot hold", "-005000-01-01T00:00:00Z"],
    ["a leap second", "2016-12-31T23:59:60Z"],
    ["an empty string", ""],
    ["a number", 20261006],
    ["an object", {}],
  ])("rejects %s", (_what, value) => {
    expect(messagesFor(value)).toEqual([
      "value must be a UTC date-time such as 2026-10-06T12:00:00Z",
    ]);
  });
});
