import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginUserDto {
  @IsEmail()
  email: string;

  // No length rule here. Sign-up decides what a valid password is; a rule
  // here that differs from it locks out users with a valid password.
  @IsString()
  @IsNotEmpty()
  password: string;
}
