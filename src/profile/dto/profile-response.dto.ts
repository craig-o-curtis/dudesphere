export class ProfileResponseDto {
  id: number;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  isDude: boolean;
  ordainedDate: string | null;
  createdAt: string;
  updatedAt: string;

  constructor(partial: Partial<ProfileResponseDto>) {
    Object.assign(this, partial);
  }
}
