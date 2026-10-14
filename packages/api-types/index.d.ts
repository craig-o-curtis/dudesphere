// The JSON shapes the API answers with, for the web app to read.
//
// Hand-written from the response DTOs in apps/api. The DTO classes stay in
// the API, because they carry class-validator and class-transformer
// decorators that do not belong in a browser bundle.
//
// apps/api/src/shared/api-types.contract.ts compares each type here with its
// DTO at compile time, so a field added, removed or renamed on either side
// fails `pnpm typecheck`.
//
// Every timestamp is an ISO 8601 UTC string. Read it with @northguild/gmt,
// never with Date.

/** Every list route: `?limit=` and `?page=` in, this envelope out. */
export interface Paginated<T> {
  data: T[];
  meta: {
    itemsPerPage: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
  };
  links: {
    first: string;
    last: string;
    current: string;
    /** The next page as a relative path, or null on the last page. */
    next: string | null;
    previous: string | null;
  };
}

export type UserRole = "admin" | "user";

/** GET /profiles/... The name other members see. Never carries a username. */
export interface ProfileResponse {
  id: number;
  userId: number;
  displayName: string;
  bio: string | null;
  profileImageUrl: string | null;
  isDude: boolean;
  ordainedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /users/me and the admin user routes. Only the member and admins see it. */
export interface UserResponse {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  profile?: ProfileResponse | null;
}

/** GET /abidings and POST /abidings. Carries the author's display name, never a username. */
export interface AbidingResponse {
  id: string;
  userId: number;
  message: string;
  imageUrl?: string | null;
  displayName?: string | null;
  hashtags: string[];
  replyToId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /hashtags. `display` keeps the casing the tag was first written in. */
export interface HashtagResponse {
  slug: string;
  display: string;
  firstUsedAt: string;
}

/** The stable `errorCode` values the API sends, from apps/api/src/shared/error-codes.ts. */
export type ApiErrorCode =
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
  | "DISPLAY_NAME_TAKEN"
  | "VALUE_TAKEN"
  | "BAD_CREDENTIALS"
  | "RESET_TOKEN_INVALID"
  | "WRONG_PASSWORD"
  | "NOT_OWNER"
  | "RATE_LIMITED"
  | "CLOCK_UNAVAILABLE"
  | "MAIL_UNAVAILABLE"
  | "DATABASE_UNAVAILABLE";

/**
 * An error body. `message` is a list when ValidationPipe refuses a body, one
 * entry per field problem. `errorCode` is one of ApiErrorCode, or a code from
 * the auth packages such as "missing_credentials".
 */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  errorCode?: ApiErrorCode | (string & {});
}

/** POST /auth/token and POST /auth/token/refresh. `expiresIn` is in seconds. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
