import { Exclude } from "class-transformer";

import { ProfileResponseDto } from "../../profiles/dto/profile-response.dto.js";
import type { UserRole } from "../user.entity.js";

export class UserResponseDto {
  id: number;
  username: string;
  email: string;
  // UserRole, not string: the same type the policies compare against, so a
  // typo in a role cannot get past the type checker.
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
