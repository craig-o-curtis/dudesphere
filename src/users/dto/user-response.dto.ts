import { Exclude } from "class-transformer";

import { ProfileResponseDto } from "../../profiles/dto/profile-response.dto.js";

export class UserResponseDto {
  id: number;
  username: string;
  email: string;
  role: string;
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
