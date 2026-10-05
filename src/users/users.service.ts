import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Not, Repository } from "typeorm";

import { UserAbidingsService } from "../abiding/user-abidings.service.js";
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
    private readonly userAbidingsService: UserAbidingsService,
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

  async getMyUser(userId: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });
    if (!user) {
      throw new NotFoundException(`My User #${userId} not found`);
    }
    return this.toResponseDto(user, user.profile);
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

  // For login. Returns null for an unknown email and for a wrong password
  // alike, so the caller can't tell which it was. A soft-deleted user is not
  // found, so they can't log in.
  async getUserByCredentials(email: string, password: string): Promise<UserResponseDto | null> {
    const user = await this.usersRepository.findOne({ where: { email } });
    // Passwords are stored as plain text today, so this is a plain compare.
    if (!user || user.password !== password) {
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

      const profile = await this.profileService.createProfileForUser(
        manager,
        user.id,
        createUserDto.profile,
      );

      return this.toResponseDto(user, profile);
    });
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    // Profile fields are updated through PATCH /profiles/:id, not here.
    const { profile: _profile, ...userFields } = updateUserDto;

    // TypeORM's update() throws UpdateValuesMissingError on an empty set, and
    // that is not a QueryFailedError, so QueryFailedFilter lets it through as
    // a 500. Every field on UpdateUserDto is optional, so an empty body and a
    // profile-only body both land here.
    if (Object.keys(userFields).length === 0) {
      throw new BadRequestException("No user fields to update");
    }
    // id: Not(id) leaves the caller's own row out. findOne returns one row, so
    // without it a user sending their own email plus a taken username could
    // get their own row back and slip past the check.
    const claimed = [
      ...(updateUserDto.email ? [{ email: updateUserDto.email, id: Not(id) }] : []),
      ...(updateUserDto.username ? [{ username: updateUserDto.username, id: Not(id) }] : []),
    ];

    if (claimed.length > 0) {
      const existing = await this.usersRepository.findOne({
        where: claimed,
        withDeleted: true,
      });
      if (existing) {
        throw new ConflictException(takenFieldMessage(existing, updateUserDto));
      }
    }

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
    // Here we don't use usersRepository.softDelete() because we need to do the profile soft-delete
    // in the same transaction. If we used usersRepository.softDelete(), it would be a separate
    // transaction and the profile soft-delete could fail after the user was already soft-deleted.
    // Note - under the hood, the softDelete only adds the deletedAt timestamp to the user row
    //
    // No try/catch here on purpose. Everything this throws already carries the
    // right status: the NotFoundException below, a ServiceUnavailableException
    // from UserAbidingsService, or a QueryFailedError that QueryFailedFilter
    // turns into a 409. Catching and re-wrapping would flatten all three into
    // a 500 and throw the stack away.
    await this.dataSource.transaction(async (manager) => {
      // The user goes first so that a missing or already-deleted user throws the
      // 404 before the profile is touched. Throwing rolls the transaction back.
      const result = await manager.softDelete(User, { id, deletedAt: IsNull() });
      if (result.affected === 0) {
        throw new NotFoundException(`User #${id} not found`);
      }
      await this.profileService.softDeleteForUser(manager, id);
      // Abidings live in Mongo, outside this transaction. They go last so any
      // earlier failure rolls back before Mongo is touched, and a Mongo
      // failure throws and rolls back the user and profile.
      await this.userAbidingsService.softDeleteForUser(id);
    });
  }

  async restoreUser(id: number): Promise<UserResponseDto> {
    // The reverse of deleteUser: the user and its profile come back together,
    // in one transaction.
    //
    // Restoring cannot collide with another account. createUser and updateUser
    // check soft-deleted rows for conflicts, so nobody can take a deleted
    // user's email or username while it is gone.
    //
    // No try/catch, for the same reason as deleteUser.
    await this.dataSource.transaction(async (manager) => {
      // Not(IsNull()) so only a soft-deleted user can be restored. An active
      // or missing user is a 404, matching deleteUser on an already-deleted one.
      const result = await manager.restore(User, { id, deletedAt: Not(IsNull()) });
      if (result.affected === 0) {
        throw new NotFoundException(`Deleted user #${id} not found`);
      }
      await this.profileService.restoreForUser(manager, id);
      // Last, for the same reason as in deleteUser.
      await this.userAbidingsService.restoreForUser(id);
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
