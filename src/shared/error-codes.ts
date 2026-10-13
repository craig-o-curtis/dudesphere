// Stable codes a client can branch on. The message next to each throw is for
// people and may change; the code may not. Add one where a client would act
// on it, not on every throw.
//
// Each code is thrown with one HTTP status, noted beside it. Keep that true:
// a client that sees EMAIL_TAKEN should never have to check the status too.
// For a code thrown from more than one place, a class in ./exceptions pairs
// the code with its status, so the two cannot drift apart: the four *_TAKEN
// codes, NOT_OWNER, TOKEN_MISSING, REFRESH_TOKEN_INVALID, CLOCK_UNAVAILABLE
// and DATABASE_UNAVAILABLE. Throw the class, not the code. The rest are each
// thrown from one place, beside a built-in exception.
//
// CLOCK_UNAVAILABLE is temporary. gmt's getUtcNow() documents "" as its
// result when the clock cannot be read, so every caller checks for it and
// throws this. The clock cannot in fact fail, and gmt 1.19.0 takes "" out of
// the contract (https://github.com/northguild/gmt/issues/303).
//
// The check is written once, in src/shared/utils/utc-clock.ts, and thrown as
// ClockUnavailableException. When that gmt version is installed, remove this
// code, that class and that file. Its callers then use gmt directly:
//
// - utcNowOrThrow, in UserAbidingsService.softDeleteForUser,
//   HashtagsService.deleteBySlug, PasswordResetService.sendLink,
//   UsersService.passwordChangedNow, SessionsService.now and
//   JwtAuthGuard.isSessionLive;
// - orClockUnavailable, in PasswordResetService.sendLink, SessionsService.after
//   and SessionsService.earlier.
//
// Remove also the matching check in HashtagsService.registerTags and the
// vi.mock of gmt in hashtags.service.spec.ts.
export enum ErrorCode {
  EMAIL_TAKEN = "EMAIL_TAKEN", // 409 Conflict
  USERNAME_TAKEN = "USERNAME_TAKEN", // 409 Conflict
  DISPLAY_NAME_TAKEN = "DISPLAY_NAME_TAKEN", // 409 Conflict
  VALUE_TAKEN = "VALUE_TAKEN", // 409 Conflict, from the database filters on a race
  BAD_CREDENTIALS = "BAD_CREDENTIALS", // 401 Unauthorized, on login
  RESET_TOKEN_INVALID = "RESET_TOKEN_INVALID", // 400 Bad Request, a password reset link that is wrong, used or expired
  TOKEN_MISSING = "TOKEN_MISSING", // 401 Unauthorized
  TOKEN_INVALID = "TOKEN_INVALID", // 401 Unauthorized, an access token that is forged, expired, or whose member or session is gone
  REFRESH_TOKEN_INVALID = "REFRESH_TOKEN_INVALID", // 401 Unauthorized, a refresh token that is unknown, expired, already used, or whose session was ended
  WRONG_PASSWORD = "WRONG_PASSWORD", // 403 Forbidden, current password check on a password change
  NOT_OWNER = "NOT_OWNER", // 403 Forbidden, editing or deleting someone else's row, or reading another user
  ROLE_REQUIRED = "ROLE_REQUIRED", // 403 Forbidden, the route needs a role the caller does not have
  RATE_LIMITED = "RATE_LIMITED", // 429 Too Many Requests, from AuthThrottlerGuard. Retry-After says how long to wait
  CLOCK_UNAVAILABLE = "CLOCK_UNAVAILABLE", // 503 Service Unavailable, getUtcNow() returned ""
  MAIL_UNAVAILABLE = "MAIL_UNAVAILABLE", // 503 Service Unavailable, the mail server did not take the message
  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE", // 503 Service Unavailable, Postgres or Mongo cannot be reached
}
