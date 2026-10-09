// Stable codes a client can branch on. The message next to each throw is for
// people and may change; the code may not. Add one where a client would act
// on it, not on every throw.
export enum ErrorCode {
  EMAIL_TAKEN = "EMAIL_TAKEN",
  USERNAME_TAKEN = "USERNAME_TAKEN",
  VALUE_TAKEN = "VALUE_TAKEN",
  BAD_CREDENTIALS = "BAD_CREDENTIALS",
  TOKEN_MISSING = "TOKEN_MISSING",
  TOKEN_INVALID = "TOKEN_INVALID",
  WRONG_PASSWORD = "WRONG_PASSWORD",
  NOT_OWNER = "NOT_OWNER",
  CLOCK_UNAVAILABLE = "CLOCK_UNAVAILABLE",
  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE",
}
