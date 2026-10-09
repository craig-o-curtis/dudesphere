// Stable codes a client can branch on. The message next to each throw is for
// people and may change; the code may not. Add one where a client would act
// on it, not on every throw.
//
// Each code is thrown with one HTTP status, noted beside it. Keep that true:
// a client that sees EMAIL_TAKEN should never have to check the status too.
export enum ErrorCode {
  EMAIL_TAKEN = "EMAIL_TAKEN", // 409 Conflict
  USERNAME_TAKEN = "USERNAME_TAKEN", // 409 Conflict
  VALUE_TAKEN = "VALUE_TAKEN", // 409 Conflict, from the database filters on a race
  BAD_CREDENTIALS = "BAD_CREDENTIALS", // 401 Unauthorized, on login
  TOKEN_MISSING = "TOKEN_MISSING", // 401 Unauthorized
  TOKEN_INVALID = "TOKEN_INVALID", // 401 Unauthorized, bad signature or expired
  WRONG_PASSWORD = "WRONG_PASSWORD", // 403 Forbidden, current password check on a password change
  NOT_OWNER = "NOT_OWNER", // 403 Forbidden, editing or deleting someone else's row
  CLOCK_UNAVAILABLE = "CLOCK_UNAVAILABLE", // 503 Service Unavailable, getUtcNow() returned ""
  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE", // 503 Service Unavailable, Mongo write failed or unreachable
}
