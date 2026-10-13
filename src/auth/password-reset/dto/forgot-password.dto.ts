import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

import { MaxCodePoints } from "../../../shared/decorators/max-code-points.decorator.js";

export class ForgotPasswordDto {
  // The same rules as an email at sign-up, so anything that could be on an
  // account passes. Trimmed first, as login trims its identifier: autofill
  // adds a space, and @IsEmail would refuse it.
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxCodePoints(100)
  email: string;
}
