import { CreateUserDto } from "./create-user.dto.js";

export class UserResponseDto extends CreateUserDto {
  id: number;
}
