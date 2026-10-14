// Keeps packages/api-types honest. Each line below compares a response DTO
// with the shared type the web app reads, in both directions, so a field
// added, removed or renamed on either side fails `pnpm typecheck` and
// `nest build`. Types only: nothing here runs.
import type {
  AbidingResponse,
  ApiErrorCode,
  HashtagResponse,
  Paginated,
  ProfileResponse,
  TokenPair,
  UserResponse,
  UserRole as SharedUserRole,
} from "@dudesphere/api-types";
import type { TokenPair as PackageTokenPair } from "@nestjs/authentication";

import type { AbidingResponseDto } from "../abidings/dto/abiding-response.dto.js";
import type { HashtagResponseDto } from "../hashtags/dto/hashtag-response.dto.js";
import type { ProfileResponseDto } from "../profiles/dto/profile-response.dto.js";
import type { UserResponseDto } from "../users/dto/user-response.dto.js";
import type { UserRole } from "../users/user.entity.js";
import type { ErrorCode } from "./error-codes.js";
import type { Paginated as ApiPaginated } from "./pagination/paginated.interface.js";

/** true when A and B are assignable to each other, false otherwise. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compiles only when given true, so a false from Same fails the build. */
type Expect<T extends true> = T;

// A string enum is not assignable to its own string values, so each enum is
// compared through a template literal type, which turns it into those values.
type UserBody = Omit<UserResponseDto, "password" | "deletedAt" | "role" | "profile"> & {
  role: `${UserRole}`;
  profile?: ProfileResponseDto | null;
};

export type UserRoleMatches = Expect<Same<`${UserRole}`, SharedUserRole>>;
export type UserMatches = Expect<Same<UserBody, UserResponse>>;
export type ProfileMatches = Expect<Same<ProfileResponseDto, ProfileResponse>>;
export type AbidingMatches = Expect<Same<AbidingResponseDto, AbidingResponse>>;
export type HashtagMatches = Expect<Same<HashtagResponseDto, HashtagResponse>>;
export type PaginatedMatches = Expect<Same<ApiPaginated<number>, Paginated<number>>>;
export type ErrorCodeMatches = Expect<Same<`${ErrorCode}`, ApiErrorCode>>;
export type TokenPairMatches = Expect<Same<PackageTokenPair, TokenPair>>;
