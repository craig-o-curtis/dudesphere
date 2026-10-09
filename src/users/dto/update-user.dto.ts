import { PartialType } from "@nestjs/mapped-types";

import { CreateUserDto } from "./create-user.dto.js";

// skipNullProperties: false, because every column behind these fields is
// NOT NULL. By default PartialType skips validation for null as well as for
// a missing field, so { "username": null } passed and then failed in Postgres
// as a 500. With the option, only a missing field is skipped.
//
// `profile` still accepts null: its own @IsOptional() on CreateUserDto says so.
export class UpdateUserDto extends PartialType(CreateUserDto, { skipNullProperties: false }) {}
