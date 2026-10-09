import { PartialType } from "@nestjs/mapped-types";

import { CreateAbidingDto } from "./create-abiding.dto.js";

// Every field of CreateAbidingDto, each one optional.
//
// skipNullProperties: false, so a missing field is skipped but a null one is
// not. { "message": null } used to pass and be quietly ignored; it is now a
// 400. imageUrl and replyToId still accept null, because their own
// @IsOptional() on CreateAbidingDto says so.
export class UpdateAbidingDto extends PartialType(CreateAbidingDto, {
  skipNullProperties: false,
}) {}
