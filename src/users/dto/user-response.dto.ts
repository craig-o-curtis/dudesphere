import { Exclude } from "class-transformer";

import { ProfileResponseDto } from "../../profiles/dto/profile-response.dto.js";
import type { UserRole } from "../user.entity.js";

export class UserResponseDto {
  id: number;
  username: string;
  email: string;
  // UserRole, not string, so the value that reaches the signed token through
  // AuthService.login is the same type RolesGuard compares against.
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  profile?: ProfileResponseDto | null;

  @Exclude()
  password?: string;

  @Exclude()
  deletedAt?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
