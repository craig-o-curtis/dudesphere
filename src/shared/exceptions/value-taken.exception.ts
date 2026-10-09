import { ConflictException } from "@nestjs/common";

import { ErrorCode } from "../error-codes.js";

/** A field with a unique index that two callers can collide on. */
export type TakenField = "email" | "username";

const BY_FIELD: Record<TakenField, { message: string; errorCode: ErrorCode }> = {
  email: { message: "Email already registered", errorCode: ErrorCode.EMAIL_TAKEN },
  username: { message: "Username already taken", errorCode: ErrorCode.USERNAME_TAKEN },
};

const FIELD_UNKNOWN = {
  message: "That value is already taken",
  errorCode: ErrorCode.VALUE_TAKEN,
};

/**
 * A value that has to be unique is already in use. A 409.
 *
 * Pass the field when the code knows which one collided: a service that
 * looked the value up before writing. The caller is then told which field to
 * change, and gets a code for it.
 *
 * Pass no field when it does not: a database filter that caught a unique
 * index refusing the write, which only happens on a race or when a service
 * forgot its lookup. The driver's message does name the index and the value,
 * but it is logged and never returned, so the wording and the code stay
 * general. Hand the driver error over as `cause`.
 */
export class ValueTakenException extends ConflictException {
  constructor(field?: TakenField, options: { cause?: unknown } = {}) {
    const { message, errorCode } = field ? BY_FIELD[field] : FIELD_UNKNOWN;
    super(message, { cause: options.cause, errorCode });
  }
}
