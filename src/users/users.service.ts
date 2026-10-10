import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, IsNull, Not, Repository } from "typeorm";

import { UserAbidingsService } from "../abidings/user-abidings.service.js";
import { HashingProvider } from "../hashing/hashing.provider.js";
import { ProfileResponseDto } from "../profiles/dto/profile-response.dto.js";
import { Profile } from "../profiles/profile.entity.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { ErrorCode } from "../shared/error-codes.js";
import {
  type TakenField,
  ValueTakenException,
} from "../shared/exceptions/value-taken.exception.js";
import type { Page, PageRequest } from "../shared/pagination/paginated.interface.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateMyUserDto } from "./dto/update-my-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { User } from "./user.entity.js";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly profilesService: ProfilesService,
    private readonly userAbidingsService: UserAbidingsService,
    private readonly hashingProvider: HashingProvider,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  async getUsers(pageRequest: PageRequest): Promise<Page<UserResponseDto>> {
    // How does this know to get all users on this.usersRepository?
    // Answer: it calls findAndCount internally in paginatePgQuery
    const { items, total } = await this.paginationProvider.paginatePgQuery(
      pageRequest,
      this.usersRepository,
      {
        // A fixed order. Without one Postgres may return rows in any order, so
        // two pages of the same list could repeat a user or skip one.
        order: { id: "ASC" },
      },
    );
    return { items: items.map((user) => this.toResponseDto(user)), total };
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
    // The column holds a hash, so the two are compared by the hasher, never
    // with ===. For an unknown email user?.password is undefined, and compare
    // still does the work before answering false. Both failures then take
    // about the same time, which keeps the response from revealing which
    // emails have an account.
    const matches = await this.hashingProvider.compare(password, user?.password);
    if (!user || !matches) {
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
        throw new ValueTakenException(takenField(existing, createUserDto));
      }

      const user = await manager.save(
        User,
        manager.create(User, {
          username: createUserDto.username,
          email: createUserDto.email,
          // Only the hash is stored. The password itself is never written.
          password: await this.hashingProvider.hash(createUserDto.password),
        }),
      );

      const profile = await this.profilesService.createProfileForUser(
        manager,
        user.id,
        createUserDto.profile,
      );

      return this.toResponseDto(user, profile);
    });
  }

  // The signed-in user updates their own account. Setting a new password
  // needs the current one too. Without that, a stolen token is enough to
  // change the password and lock the real owner out for good.
  //
  // An admin resets someone's password through updateUser below, which asks
  // for nothing more: the admin does not know the user's current password.
  async updateMyUser(userId: number, updateMyUserDto: UpdateMyUserDto): Promise<UserResponseDto> {
    const { currentPassword, ...updateUserDto } = updateMyUserDto;

    if (updateUserDto.password !== undefined) {
      if (currentPassword === undefined) {
        throw new BadRequestException("currentPassword is required to set a new password");
      }

      const user = await this.usersRepository.findOne({ where: { id: userId } });
      const matches = await this.hashingProvider.compare(currentPassword, user?.password);
      if (!user) {
        throw new NotFoundException(`My User #${userId} not found`);
      }
      // 403, not 401. The caller is signed in, so a client must not treat
      // this as an expired session and log them out.
      if (!matches) {
        throw new ForbiddenException("Current password is incorrect", {
          errorCode: ErrorCode.WRONG_PASSWORD,
        });
      }
    }

    return this.updateUser(userId, updateUserDto);
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    // Profile fields are updated through PATCH /profiles/:id, not here.
    const { profile: _profile, ...userFields } = updateUserDto;

    // TypeORM's update() throws UpdateValuesMissingError on an empty set, and
    // that is not a QueryFailedError, so PgErrorFilter lets it through as
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
        throw new ValueTakenException(takenField(existing, updateUserDto));
      }
    }

    // A new password arrives as plain text and is stored as a hash, the same
    // as on sign-up. update() below runs no entity hooks, so it is done here.
    if (userFields.password !== undefined) {
      userFields.password = await this.hashingProvider.hash(userFields.password);
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
    // from UserAbidingsService, or a QueryFailedError that PgErrorFilter
    // turns into a 409. Catching and re-wrapping would flatten all three into
    // a 500 and throw the stack away.
    await this.dataSource.transaction(async (manager) => {
      // The user goes first so that a missing or already-deleted user throws the
      // 404 before the profile is touched. Throwing rolls the transaction back.
      const result = await manager.softDelete(User, { id, deletedAt: IsNull() });
      if (result.affected === 0) {
        throw new NotFoundException(`User #${id} not found`);
      }
      await this.profilesService.softDeleteForUser(manager, id);
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
      await this.profilesService.restoreForUser(manager, id);
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
 * Says which field collided, so the 409 can tell the caller what to change.
 * The wording and the code for each field belong to ValueTakenException.
 * Only email is compared directly — a row that came back without matching the
 * attempted email must have matched on username, because those are the two
 * fields the lookup searched.
 */
function takenField(
  existing: Pick<User, "email" | "username">,
  attempted: { email?: string; username?: string },
): TakenField {
  return attempted.email && existing.email === attempted.email ? "email" : "username";
}
