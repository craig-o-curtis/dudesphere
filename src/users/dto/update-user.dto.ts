import { OmitType, PartialType } from "@nestjs/mapped-types";

import { CreateUserDto } from "./create-user.dto.js";

// skipNullProperties: false, because every column behind these fields is
// NOT NULL. By default PartialType skips validation for null as well as for
// a missing field, so { "username": null } passed and then failed in Postgres
// as a 500. With the option, only a missing field is skipped.
//
// No `profile`. A profile is edited through PATCH /profiles/me or
// PATCH /profiles/:id, so one sent here is refused as an unknown field. It
// used to be accepted and ignored. Leaving it in would also make this route
// demand a displayName, which CreateUserDto's profile requires.
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ["profile"] as const), {
  skipNullProperties: false,
}) {}
