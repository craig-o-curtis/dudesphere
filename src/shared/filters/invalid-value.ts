import { BadRequestException } from "@nestjs/common";

// SQLSTATE codes Postgres raises when a value does not fit its column:
// 22001 too long, 22007 and 22008 a bad date or time, 22021 a character the
// encoding cannot hold (the NUL character), 22P02 text that is not valid for
// the type (a bad enum or number), 22P05 a character that cannot be converted.
//
// It is a list, not the whole 22 class, on purpose. A code that is not here
// stays a 500:
// - 22012 (division by zero) and its neighbours point at our SQL, not at the
//   caller's value.
// - 22003 (number out of range) is also what a full id sequence raises.
//   IdParamDto already stops the caller's case.
// - 23502 (not null) is left out too. If a migration adds a NOT NULL column
//   that the code forgets to set, every insert raises it, and a 400 would
//   hide that outage. The DTOs reject null where the column needs a value,
//   and src/shared/dto/entity-rules.spec.ts keeps them doing so.
const BAD_VALUE_STATES = new Set(["22001", "22007", "22008", "22021", "22P02", "22P05"]);

/** True for a SQLSTATE that means "this value does not fit the column". */
export function isBadValueState(code: unknown): code is string {
  return typeof code === "string" && BAD_VALUE_STATES.has(code);
}

/**
 * The one 400 the database filters answer with when the database, not a DTO,
 * was the first to refuse a value.
 *
 * The message is fixed. The driver's own text can quote the refused value, so
 * it is logged and never returned. The driver error rides along as `cause`.
 */
export function invalidValue(cause: unknown): BadRequestException {
  return new BadRequestException("A value in the request is not valid", { cause });
}
