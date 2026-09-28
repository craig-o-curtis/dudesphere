import { Exclude } from "class-transformer";

export class UserResponseDto {
  id: number;
  name: string;
  email: string;
  role: string;
  isDude: boolean;
  createdAt: string;
  updatedAt: string;

  @Exclude()
  password?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
