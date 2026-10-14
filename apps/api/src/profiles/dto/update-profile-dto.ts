import { PartialType } from "@nestjs/mapped-types";

import { CreateProfileDto } from "./create-profile-dto.js";

// skipNullProperties: false, so PartialType skips a missing field but not a
// null one. Whether null is allowed is then decided per field on
// CreateProfileDto: the nullable columns carry @IsOptional() and accept it,
// and isDude, which is NOT NULL, does not.
export class UpdateProfileDto extends PartialType(CreateProfileDto, {
  skipNullProperties: false,
}) {}
