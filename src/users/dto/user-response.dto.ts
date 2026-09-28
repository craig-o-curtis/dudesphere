import { Exclude } from "class-transformer";

export class UserResponseDto {
  id: number;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;

  @Exclude()
  password?: string;

  @Exclude()
  deletedAt?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
