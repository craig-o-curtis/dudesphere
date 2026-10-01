import type { Profile } from "../profile.entity.js";

export class ProfileResponseDto {
  constructor(partial: Partial<ProfileResponseDto>) {
    Object.assign(this, partial);
  }

  id: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  isDude: boolean;
  ordainedDate: string | null;
  createdAt: string;
  updatedAt: string;

  static fromEntity(profile: Profile): ProfileResponseDto {
    return new ProfileResponseDto({
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      bio: profile.bio ?? null,
      profileImageUrl: profile.profileImageUrl ?? null,
      isDude: profile.isDude,
      ordainedDate: profile.ordainedDate ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });
  }
}
