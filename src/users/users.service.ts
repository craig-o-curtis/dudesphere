import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Not, Repository } from "typeorm";

import { ProfileResponseDto } from "../profile/dto/profile-response.dto.js";
import { Profile } from "../profile/profile.entity.js";
import { ProfileService } from "../profile/profile.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { User } from "./user.entity.js";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly profileService: ProfileService,
  ) {}

  async getUsers(limit: number = 10, page: number = 1): Promise<UserResponseDto[]> {
    const pageSize = limit;
    const pageNum = page;
    const users = await this.usersRepository.find({
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    });
    return users.map((user) => this.toResponseDto(user));
  }

  async getUserById(id: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { profile: true },
    });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.toResponseDto(user, user.profile);
  }

  async getUsersByIds(ids: number[]): Promise<UserResponseDto[]> {
    if (ids.length === 0) {
      return [];
    }
    // withDeleted: callers use this to name the author of existing content.
    // A soft-deleted user still wrote what they wrote.
    const users = await this.usersRepository.find({ where: { id: In(ids) }, withDeleted: true });
    return users.map((user) => this.toResponseDto(user));
  }

  async getUserByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      return null;
    }
    return this.toResponseDto(user);
  }

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Everything inside this callback is ONE transaction.
    // If anything throws, both inserts are rolled back.
    // Rule: inside here, use `manager` for every query — never this.usersRepository.
    return this.dataSource.transaction(async (manager) => {
      // withDeleted: the unique indexes on email and username still cover
      // soft-deleted rows, so the check has to see them too. Without it a
      // deleted user's email passes here and then fails on the index as a 500.
      const existing = await manager.findOne(User, {
        where: [{ email: createUserDto.email }, { username: createUserDto.username }],
        withDeleted: true,
      });
      if (existing) {
        throw new ConflictException(takenFieldMessage(existing, createUserDto));
      }

      const user = await manager.save(
        User,
        manager.create(User, {
          username: createUserDto.username,
          email: createUserDto.email,
          password: createUserDto.password,
        }),
      );

      const profile = await this.profileService.createForUser(
        manager,
        user.id,
        createUserDto.profile,
      );

      return this.toResponseDto(user, profile);
    });
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const claimed = [
      ...(updateUserDto.email ? [{ email: updateUserDto.email }] : []),
      ...(updateUserDto.username ? [{ username: updateUserDto.username }] : []),
    ];

    if (claimed.length > 0) {
      const existing = await this.usersRepository.findOne({
        where: claimed,
        withDeleted: true,
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(takenFieldMessage(existing, updateUserDto));
      }
    }

    // Profile fields are updated through PATCH /profiles/:id, not here
    const { profile: _profile, ...userFields } = updateUserDto;
    // deletedAt: IsNull() because update() does not apply the soft-delete
    // filter that find() does. Without it a deleted row gets mutated and
    // the caller still gets a 404 from getUserById below.
    const result = await this.usersRepository.update({ id, deletedAt: IsNull() }, userFields);
    if (result.affected === 0) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.getUserById(id);
  }

  async deleteUser(id: number): Promise<void> {
    // Soft delete: sets deletedAt instead of removing the row. The profile is
    // soft-deleted in the same transaction, because ON DELETE CASCADE only
    // fires on a real DELETE.
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.softDelete(User, { id, deletedAt: IsNull() });
      if (result.affected === 0) {
        throw new NotFoundException(`User #${id} not found`);
      }
      await this.profileService.softDeleteForUser(manager, id);
    });
  }

  async restoreUser(id: number): Promise<UserResponseDto> {
    // The reverse of deleteUser: the user and its profile come back together,
    // in one transaction.
    //
    // Restoring cannot collide with another account. createUser and updateUser
    // check soft-deleted rows for conflicts, so nobody can take a deleted
    // user's email or username while it is gone.
    await this.dataSource.transaction(async (manager) => {
      // Not(IsNull()) so only a soft-deleted user can be restored. An active
      // or missing user is a 404, matching deleteUser on an already-deleted one.
      const result = await manager.restore(User, { id, deletedAt: Not(IsNull()) });
      if (result.affected === 0) {
        throw new NotFoundException(`Deleted user #${id} not found`);
      }
      await this.profileService.restoreForUser(manager, id);
    });
    return this.getUserById(id);
  }

  private toResponseDto(user: User, profile?: Profile | null): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: profile ? ProfileResponseDto.fromEntity(profile) : undefined,
    });
  }
}

/**
 * Names the field that collided so a 409 tells the caller what to change.
 * Only email is compared directly — a row that came back without matching the
 * attempted email must have matched on username, because those are the two
 * fields the lookup searched.
 */
function takenFieldMessage(
  existing: Pick<User, "email" | "username">,
  attempted: { email?: string; username?: string },
): string {
  if (attempted.email && existing.email === attempted.email) {
    return "Email already registered";
  }
  return "Username already taken";
}
