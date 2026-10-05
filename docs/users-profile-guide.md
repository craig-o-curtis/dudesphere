# Tutorial: Give Every User a Profile

By the end of this tutorial:

- `POST /users` creates a user **and** their profile in one request.
- If either insert fails, neither is saved.
- Deleting a user deletes their profile automatically.
- The build error `Property 'getProfileByUserId' does not exist` is gone.

**Time:** about an hour. **You need:** Docker running (`dude-postgres` and `dude-mongo` containers up).

**How to use this:** do the steps in order. Every lesson ends with a **✅ Check**, so run it before moving on. The **💡 Why** boxes explain the reasoning; read them, but you can come back to them later.

> Every file below was tested: built, run against a real Postgres, and hit with the exact `curl` commands in Lesson 6. If your result doesn't match a ✅ Check, stop and look at that lesson again before continuing.

---

## Lesson 0 — Get ready

1. Stop `pnpm start:dev` if it's running. You'll start the app again in Lesson 6.
2. Optional but recommended: save your current state so you can compare later.
   ```bash
   git add -A && git commit -m "WIP: before profile tutorial"
   ```

---

## Lesson 1 — Make the Profile point at its User

Right now the `user` table points at the profile (`user.profileId`). You'll flip it so the **profile points at its user** (`profile.userId`), which is how your migration was originally written.

### Step 1.1 — Replace `src/profile/profile.entity.ts`

Replace the whole file with:

```ts
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { UpdateUtcColumn } from "../shared/decorators/update-utc-column.decorator.js";
import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";
import { User } from "../users/user.entity.js";

@Entity("profile")
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  // The foreign key column. It lives on this table because Profile is the "owning side".
  @Column({ type: "int" })
  userId: number;

  @OneToOne(() => User, (user) => user.profile, {
    onDelete: "CASCADE", // when the user row is deleted, Postgres deletes this row too
    nullable: false, // a profile can never exist without a user
  })
  @JoinColumn({ name: "userId" })
  user: Relation<User>;

  @Column({ type: "varchar", nullable: true, length: 100 })
  firstName: string | null;

  @Column({ type: "varchar", nullable: true, length: 100 })
  lastName: string | null;

  @Column({ type: "text", nullable: true })
  bio: string | null;

  @Column({ type: "varchar", nullable: true })
  profileImageUrl: string | null;

  @Column({ type: "boolean", default: false })
  isDude: boolean;

  // Optional date when the user was ordained as a dude priest (ISO 8601 UTC string)
  @UtcColumn({ nullable: true })
  ordainedDate: string | null;

  // Auto-set once on row creation
  @CreateUtcColumn()
  createdAt: string;

  // Auto-set on creation, auto-update on every change
  @UpdateUtcColumn()
  updatedAt: string;
}
```

What changed: `@Unique(["userId"])` is gone, and `userId` plus the `user` relation were added.

### Step 1.2 — Edit `src/users/user.entity.ts`

1. Change the `typeorm` import line to:
   ```ts
   import { Column, Entity, Index, OneToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
   ```
   (`JoinColumn` is removed and `type Relation` is added.)
2. Find the `@OneToOne` block, the one with `cascade: [...]` and `@JoinColumn()`, and replace **all of it** with:
   ```ts
   @OneToOne(() => Profile, (profile) => profile.user)
   profile?: Relation<Profile>;
   ```

### ✅ Check

```bash
pnpm build
```

You should **still** see the `getProfileByUserId` error. That's expected, and Lesson 2 fixes it. There should be **no other** errors.

### 💡 Why

- **`@JoinColumn` decides which table gets the foreign-key column.** Putting it on `Profile` puts `userId` on the `profile` table.
- **Why the profile should point at the user:** `onDelete: "CASCADE"` means _"when the row I point at is deleted, delete me too."_ With `profile.userId`, deleting a user deletes their profile, which is what you want. The old way (`user.profileId`) flips that around: deleting a profile would delete the **user**.
- **Why remove `@Unique(["userId"])`:** a `@JoinColumn` on a `@OneToOne` already makes the column unique, so you'd be adding it twice.
- **Why `Relation<User>` instead of just `User`:** your project is an ES module (`"type": "module"`), and these two files import each other. With a plain `User` type, the app crashes on startup with `Cannot access 'User' before initialization`. `Relation<>` is TypeORM's fix for exactly this situation.

---

## Lesson 2 — Fix the Profile module (this makes the build pass)

### Step 2.1 — Replace `src/profile/dto/profile-response.dto.ts`

```ts
import type { Profile } from "../profile.entity.js";

export class ProfileResponseDto {
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

  constructor(partial: Partial<ProfileResponseDto>) {
    Object.assign(this, partial);
  }

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
```

### Step 2.2 — Replace `src/profile/profile.service.ts`

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import { CreateProfileDto } from "./dto/create-profile-dto.js";
import { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { UpdateProfileDto } from "./dto/update-profile-dto.js";
import { Profile } from "./profile.entity.js";

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  async getProfiles(limit?: number, page?: number): Promise<ProfileResponseDto[]> {
    const pageSize = limit ?? 20;
    const pageNum = page ?? 1;
    const profiles = await this.profileRepository.find({
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    });
    return profiles.map((profile) => ProfileResponseDto.fromEntity(profile));
  }

  async getProfileById(id: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Profile #${id} not found`);
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  async getProfileByUserId(userId: number): Promise<ProfileResponseDto> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(`Profile for user #${userId} not found`);
    }
    return ProfileResponseDto.fromEntity(profile);
  }

  // Called by UsersService inside its transaction.
  // It uses the `manager` it is given, NOT this.profileRepository,
  // so the insert is part of the same transaction as the user insert.
  async createProfileForUser(
    manager: EntityManager,
    userId: number,
    dto?: CreateProfileDto,
  ): Promise<Profile> {
    const profile = manager.create(Profile, {
      userId,
      firstName: dto?.firstName ?? null,
      lastName: dto?.lastName ?? null,
      bio: dto?.bio ?? null,
      profileImageUrl: dto?.profileImageUrl ?? null,
      isDude: dto?.isDude ?? false,
      ordainedDate: dto?.ordainedDate ?? null,
    });
    return manager.save(Profile, profile);
  }

  async updateProfile(id: number, updateProfileDto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const result = await this.profileRepository.update(id, updateProfileDto);
    if (result.affected === 0) {
      throw new NotFoundException(`Profile #${id} not found`);
    }
    return this.getProfileById(id);
  }
}
```

### Step 2.3 — Replace `src/profile/profile.controller.ts`

```ts
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from "@nestjs/common";

import { ProfileResponseDto } from "./dto/profile-response.dto.js";
import { UpdateProfileDto } from "./dto/update-profile-dto.js";
import { ProfileService } from "./profile.service.js";

@Controller("profiles")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfiles(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<ProfileResponseDto[]> {
    return this.profileService.getProfiles(limit, page);
  }

  // Must come BEFORE @Get(":id"), or "user" gets matched as an :id
  @Get("user/:userId")
  getProfileByUserId(@Param("userId", ParseIntPipe) userId: number): Promise<ProfileResponseDto> {
    return this.profileService.getProfileByUserId(userId);
  }

  @Get(":id")
  getProfileById(@Param("id", ParseIntPipe) id: number): Promise<ProfileResponseDto> {
    return this.profileService.getProfileById(id);
  }

  @Patch(":id")
  updateProfile(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.updateProfile(id, updateProfileDto);
  }
}
```

### Step 2.4 — Two small edits

1. **`src/profile/profile.module.ts`**: add one line under `providers`:
   ```ts
   exports: [ProfileService],
   ```
2. **`src/profile/dto/create-profile-dto.ts`**: delete `IsInt,` from the import list. Nothing uses it anymore.

### ✅ Check

```bash
pnpm build
```

**No errors.** The TS2551 error is fixed.

### 💡 Why

- **`NotFoundException` instead of `throw new Error()`:** Nest turns `NotFoundException` into a **404**. A plain `Error` becomes a **500**, which tells the client your server crashed when really the thing just doesn't exist.
- **Route order matters.** Nest checks routes from top to bottom. When `@Get(":id")` came first, `GET /profiles/user/5` matched it, `ParseIntPipe` tried to turn `"user"` into a number, and you got a 400. Put fixed paths (`user/...`) above parameter paths (`:id`).
- **`POST /profiles` and `DELETE /profiles/:id` are gone on purpose.** A profile belongs to a user. It's created along with the user (Lesson 3) and deleted along with the user (the cascade). If clients could create profiles directly, they'd have to send a `userId`, and then anyone could attach a profile to anyone's account.
- **`exports: [ProfileService]`** lets other modules (UsersModule, next lesson) use `ProfileService`. Without it, the service is private to ProfileModule.
- **`fromEntity` returns a real class instance.** Nest's `ClassSerializerInterceptor` (in `main.ts`) only works on class instances, not plain `{ }` objects. That's what makes `@Exclude()` work.

---

## Lesson 3 — Create the user and profile together

### Step 3.1 — Replace `src/users/dto/create-user.dto.ts`

```ts
import { Type } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { CreateProfileDto } from "../../profile/dto/create-profile-dto.js";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(20)
  password: string;

  // Optional. A profile is always created; these are its starting values.
  // @ValidateNested + @Type are BOTH needed for the nested fields to be validated.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProfileDto)
  profile?: CreateProfileDto;
}
```

### Step 3.2 — Replace `src/users/dto/user-response.dto.ts`

```ts
import { Exclude } from "class-transformer";

import { ProfileResponseDto } from "../../profile/dto/profile-response.dto.js";

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
```

### Step 3.3 — Replace `src/users/users.service.ts`

```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

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

  async getUsers(limit?: number, page?: number): Promise<UserResponseDto[]> {
    const pageSize = limit ?? 20;
    const pageNum = page ?? 1;
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
      const existing = await manager.findOne(User, {
        where: { email: createUserDto.email },
      });
      if (existing) {
        throw new ConflictException("Email already registered");
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
    if (updateUserDto.email) {
      const existing = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException("Email already registered");
      }
    }

    // Profile fields are updated through PATCH /profiles/:id, not here
    const { profile: _profile, ...userFields } = updateUserDto;
    const result = await this.usersRepository.update(id, userFields);
    if (result.affected === 0) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.getUserById(id);
  }

  async deleteUser(id: number): Promise<void> {
    // Soft delete: sets deletedAt instead of removing the row.
    const result = await this.usersRepository.softDelete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User #${id} not found`);
    }
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
```

### Step 3.4 — Replace `src/users/users.module.ts`

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ProfileModule } from "../profile/profile.module.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User]), ProfileModule],
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
})
export class UsersModule {}
```

### Step 3.5 — Replace `src/users/users.controller.ts`

```ts
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserResponseDto } from "./dto/user-response.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getUsers(
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<UserResponseDto[]> {
    return this.usersService.getUsers(limit, page);
  }

  @Get(":id")
  getUserById(@Param("id", ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  @Post()
  createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.createUser(createUserDto);
  }

  @Patch(":id")
  updateUser(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Delete(":id")
  @HttpCode(204)
  deleteUser(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.usersService.deleteUser(id);
  }
}
```

### ✅ Check

```bash
pnpm build
```

No errors. You'll try the endpoints for real in Lesson 6, after the database is fixed.

### 💡 Why

- **Why a transaction?** Creating a user with a profile is two inserts. If the second one fails, a transaction undoes the first, so you never get a user without a profile.
- **The one rule:** inside `dataSource.transaction(async (manager) => { ... })`, use `manager` for **every** query. `this.usersRepository` runs outside the transaction and won't be rolled back. That's also why `createProfileForUser` takes `manager` as a parameter: the profile insert joins the same transaction.
- **Why not TypeORM's `cascade: ["insert"]`?** It works, but it hides what's being saved. TypeORM's own docs warn that cascades can cause "unintended side effects, bugs, and security issues". An explicit transaction is easier to read and to test.
- **Why `@ValidateNested()` and `@Type()`?** I tested all three versions against your validation settings:

  | Decorators on `profile`              | Sending `{"firstName":"X","evil":1}`                                     |
  | ------------------------------------ | ------------------------------------------------------------------------ |
  | only `@IsOptional()` (your old code) | **Accepted with no checks at all**, including the made-up `evil` field   |
  | `+ @ValidateNested()`                | Rejects everything, even valid profiles                                  |
  | `+ @ValidateNested()` `+ @Type(...)` | ✅ Rejects `evil` and the too-short `firstName`; valid data goes through |

  `@ValidateNested()` says "check inside this object". `@Type()` says "and here's which class to check it against".

- **`UsersModule` imports `ProfileModule`.** That's how UsersService gets ProfileService injected. ProfileModule does **not** import UsersModule, so there's no circular dependency and no `forwardRef()` is needed.
- **Soft delete:** `softDelete` sets `deletedAt` instead of removing the row, and TypeORM then hides that user from normal queries. Because the row isn't really deleted, the profile stays. That's fine: if you ever restore the user, their profile is still there.

---

## Lesson 4 — Fix the seed

The seed creates a new, unlinked profile **every time it runs**, because it never loads the admin's existing profile.

### Step 4.1 — Replace `src/profile/profiles.seed.ts`

```ts
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/user.entity.js";
import { Profile } from "./profile.entity.js";

@Injectable()
export class ProfilesSeedService {
  private readonly logger = new Logger(ProfilesSeedService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profilesRepository: Repository<Profile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async seed(adminEmail: string): Promise<void> {
    if (!adminEmail) {
      this.logger.warn("EMAIL not set — skipping profile seed");
      return;
    }

    // relations: { profile: true } loads the admin's profile along with the user.
    // Without it, adminUser.profile is always undefined.
    const adminUser = await this.usersRepository.findOne({
      where: { email: adminEmail },
      relations: { profile: true },
    });

    if (!adminUser) {
      this.logger.warn(`Admin user (${adminEmail}) not found — skipping profile seed`);
      return;
    }

    const profile = adminUser.profile ?? this.profilesRepository.create({ userId: adminUser.id });
    const isNew = !adminUser.profile;

    profile.firstName = "Admin";
    profile.lastName = "Dude";
    profile.bio = "bio breaking";
    profile.isDude = true;
    await this.profilesRepository.save(profile);

    this.logger.log(`${isNew ? "Seeded" : "Updated"} admin profile for user ${adminEmail}`);
  }
}
```

### ✅ Check

`pnpm build` has no errors. You'll run the seed in Lesson 5.

### 💡 Why

**TypeORM never loads a relation unless you ask for it** with `relations: { profile: true }`. If `user.profile` is `undefined`, that means "not loaded", not "doesn't exist". (In TypeORM 1.x it must be the object form `{ profile: true }`; the old array form `["profile"]` no longer compiles.)

---

## Lesson 5 — Reset the database and use migrations

Your local database has drifted. `synchronize: true` applied your half-finished change on top of the migration, so right now it has **both** `profile.userId` and `user.profileId`, and the original cascade link is gone. You'll rebuild it cleanly.

### Step 5.1 — Turn off `synchronize`

In `src/app.module.ts`, change the `synchronize:` line to:

```ts
        synchronize: false, // migrations are the single source of truth for the schema
```

### Step 5.2 — Reset your local database

⚠️ This **deletes all data** in your local Postgres `dude` database. Today that's only the seeded Admin user and their profile, which the seed recreates. Mongo is not touched.

```bash
docker exec dude-postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

### Step 5.3 — Build the tables from your existing migration

```bash
pnpm migration:run
```

The last line should say `Migration CreateInitialSchema1700000000000 has been executed successfully.`

### Step 5.4 — Ask TypeORM what's different

```bash
pnpm migration:generate src/database/migrations/AlignSchema
```

This compares your entities to the database and writes the differences into a new file, `src/database/migrations/<timestamp>-AlignSchema.ts`. Open it.

### Step 5.5 — Read it, and fix the dangerous part

In the `up()` method, find these three lines:

```ts
await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "role"`);
await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'user')`);
await queryRunner.query(
  `ALTER TABLE "user" ADD "role" "public"."user_role_enum" NOT NULL DEFAULT 'user'`,
);
```

**Replace them** with:

```ts
// EDITED BY HAND: TypeORM generated DROP COLUMN + ADD COLUMN here, which would
// wipe every user's role. Converting the column in place keeps the data.
await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'user')`);
await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
await queryRunner.query(
  `ALTER TABLE "user" ALTER COLUMN "role" TYPE "public"."user_role_enum" USING "role"::"public"."user_role_enum"`,
);
await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
```

Leave the other lines as they are. They only rename indexes and the foreign key to TypeORM's naming style.

`down()` has the same problem in reverse. It's what runs if you ever `pnpm migration:revert`. Find:

```ts
await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "role"`);
await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
await queryRunner.query(`ALTER TABLE "user" ADD "role" character varying NOT NULL DEFAULT 'user'`);
```

and replace it with:

```ts
// EDITED BY HAND: same fix in reverse — convert back to varchar without losing roles.
await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
await queryRunner.query(
  `ALTER TABLE "user" ALTER COLUMN "role" TYPE character varying USING "role"::text`,
);
await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
```

### Step 5.6 — Run it, then confirm nothing is left

```bash
pnpm migration:run
pnpm migration:generate src/database/migrations/Check
```

The second command should print **`No changes in database schema were found`**. It exits with an error code, and that's expected: it just means there's nothing to generate.

### Step 5.7 — Seed twice

```bash
pnpm seed:run
pnpm seed:run
```

The first run logs `Seeded admin profile…`. The **second** run logs **`Updated admin profile…`**. Then confirm there's exactly one profile:

```bash
docker exec dude-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM profile"'
```

**✅ Check:** `count` is `1`.

### 💡 Why

- **`synchronize: true` quietly changes your tables** every time the app starts. It will even drop columns, and it leaves no record of what it did. That's how your database drifted. Migrations are files you can read, review, commit, and run the same way everywhere.
- **Always read a generated migration before running it.** TypeORM can't tell "change this column's type" from "delete it and make a new one". On a database with real users, the generated version would have reset every role, including admin.
- **Never edit a migration that has already run** (like `CreateInitialSchema`). Databases that already ran it won't run it again, so the edit would never reach them. Add a new migration instead, like you just did.

---

## Lesson 6 — Try it

Start the app:

```bash
pnpm start:dev
```

In another terminal, run these one at a time. Your ids may differ; use the ones in your responses.

**Create a user with a profile → `201`**, and the response includes `profile`:

```bash
curl -i -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"username":"dude","email":"d@x.com","password":"secret1","profile":{"firstName":"The","lastName":"Dude","isDude":true}}'
```

**Same email again → `409`** `Email already registered`:

```bash
curl -i -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"username":"dude2","email":"d@x.com","password":"secret1"}'
```

**No profile sent → `201`**, and an empty profile is still created:

```bash
curl -i -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"username":"walter","email":"w@x.com","password":"secret1"}'
```

**Bad profile → `400`**, listing both problems:

```bash
curl -i -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"username":"bad","email":"b@x.com","password":"secret1","profile":{"firstName":"X","evil":1}}'
```

Expected message: `profile.property evil should not exist`, `profile.firstName must be longer than or equal to 2 characters`.

**Get a profile by user id → `200`** (use the id of `dude`):

```bash
curl -i localhost:3000/profiles/user/2
```

**Missing things → `404`** (these used to be `500`):

```bash
curl -i localhost:3000/users/99999
curl -i localhost:3000/profiles/user/99999
```

**Update a profile → `200`**, with the new bio in the response (use `dude`'s profile id):

```bash
curl -i -X PATCH localhost:3000/profiles/2 -H 'Content-Type: application/json' -d '{"bio":"The Dude abides"}'
```

**Delete a user → `204`**, then fetching them gives `404`:

```bash
curl -i -X DELETE localhost:3000/users/2
curl -i localhost:3000/users/2
```

**See the database cascade** by really deleting `walter` in SQL:

```bash
docker exec dude-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM \"user\" WHERE email = '"'"'w@x.com'"'"'" -c "SELECT count(*) FROM profile"'
```

**✅ Check:** walter's profile disappeared on its own, leaving 2 profiles (Admin and the soft-deleted `dude`).

---

## Lesson 7 — Make the tests real

Every test in `users/` and `profile/` currently **fails**. They're the stubs Nest generated, and they never provided the things the services need.

### Step 7.1 — Replace `vitest.config.ts`

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.spec.ts"],
    // Decorators like @Type() need this loaded first; Nest loads it for the app, tests must too
    setupFiles: ["reflect-metadata"],
    // .kilo/worktrees holds old copies of the repo — don't run their tests
    exclude: [...configDefaults.exclude, ".kilo/**"],
  },
});
```

### Step 7.2 — Delete two empty test files

Vitest fails any test file that has no tests in it:

```bash
rm src/profile/dto/profile-response.dto.spec.ts src/shared/utils/iso-timestamp-transformer.spec.ts
```

### Step 7.3 — Replace `src/profile/profile.service.spec.ts`

```ts
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Profile } from "./profile.entity.js";
import { ProfileService } from "./profile.service.js";

describe("ProfileService", () => {
  let service: ProfileService;

  // A fake repository: only the methods ProfileService actually calls.
  const profileRepository = {
    findOne: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ProfileService,
        // Provide the fake under the same token @InjectRepository(Profile) asks for
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
      ],
    }).compile();

    service = module.get(ProfileService);
  });

  it("returns the profile for a user", async () => {
    profileRepository.findOne.mockResolvedValue({
      id: 7,
      userId: 3,
      isDude: true,
    });

    const result = await service.getProfileByUserId(3);

    expect(profileRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 3 },
    });
    expect(result.id).toBe(7);
  });

  it("throws NotFoundException when the user has no profile", async () => {
    profileRepository.findOne.mockResolvedValue(null);

    await expect(service.getProfileByUserId(3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when updating a profile that does not exist", async () => {
    profileRepository.update.mockResolvedValue({ affected: 0 });

    await expect(service.updateProfile(999, { bio: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

### Step 7.4 — Replace `src/users/users.service.spec.ts`

```ts
import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { ProfileService } from "../profile/profile.service.js";
import { User } from "./user.entity.js";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  let service: UsersService;

  // A fake EntityManager: what the transaction callback receives.
  const manager = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  // A fake DataSource whose transaction() just runs the callback with our fake manager.
  const dataSource = {
    transaction: vi.fn((callback: (m: typeof manager) => unknown) => callback(manager)),
  };

  const profileService = {
    createProfileForUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.create.mockImplementation((_entity: unknown, values: object) => values);

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: ProfileService, useValue: profileService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it("creates the user and the profile using the SAME transaction manager", async () => {
    manager.findOne.mockResolvedValue(null);
    manager.save.mockResolvedValue({
      id: 42,
      username: "dude",
      email: "d@x.com",
    });
    profileService.createProfileForUser.mockResolvedValue({
      id: 1,
      userId: 42,
      isDude: true,
    });

    const result = await service.createUser({
      username: "dude",
      email: "d@x.com",
      password: "secret1",
      profile: { firstName: "The" },
    });

    // This is the important assertion: the profile was created with the
    // transaction's manager, so it rolls back together with the user.
    expect(profileService.createProfileForUser).toHaveBeenCalledWith(manager, 42, {
      firstName: "The",
    });
    expect(result.id).toBe(42);
    expect(result.profile?.userId).toBe(42);
  });

  it("throws 409 and creates nothing when the email is taken", async () => {
    manager.findOne.mockResolvedValue({ id: 1 });

    await expect(
      service.createUser({
        username: "dude",
        email: "d@x.com",
        password: "secret1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(manager.save).not.toHaveBeenCalled();
    expect(profileService.createProfileForUser).not.toHaveBeenCalled();
  });
});
```

### Step 7.5 — Fix the two controller tests

In **`src/users/users.controller.spec.ts`**:

1. Add this import:
   ```ts
   import { UsersService } from "./users.service.js";
   ```
2. Under `controllers: [UsersController],` add:
   ```ts
   // The controller needs a UsersService. Give it an empty fake.
   providers: [{ provide: UsersService, useValue: {} }],
   ```

Do the same in **`src/profile/profile.controller.spec.ts`**, using `ProfileService` and `./profile.service.js`.

### ✅ Check

```bash
pnpm test
```

Every test in `users/` and `profile/` passes. **4 tests still fail**, in `auth/` and `abiding/`. They're the same untouched Nest stubs with the same problem. Fixing them the same way (provide a fake for each constructor argument) is good practice.

### 💡 Why

- **Unit tests shouldn't need a database.** You give Nest fakes under the **same token** the real code asks for. `getRepositoryToken(Profile)` is the token that `@InjectRepository(Profile)` uses.
- **The first `UsersService` test is the valuable one.** It proves the profile is created with the **transaction's** `manager`. If someone later changes `createProfileForUser` to use its own repository, the transaction silently breaks, and this test catches it.

---

## What you learned

1. **`@JoinColumn` decides where the foreign key lives.** Put it on the dependent side (Profile), so `ON DELETE CASCADE` deletes in the right direction.
2. **In ESM projects, wrap relation types in `Relation<>`** when two entities import each other.
3. **Multi-step writes go in a transaction**, and every query inside uses the transaction's `manager`.
4. **Nested DTOs need `@ValidateNested()` and `@Type()`.** Without them the nested data isn't checked at all.
5. **Throw Nest's HTTP exceptions** (`NotFoundException`, `ConflictException`) so clients get real status codes.
6. **Fixed routes go above `:param` routes.**
7. **Relations only load when you ask** (`relations: { profile: true }`).
8. **Use migrations, not `synchronize`**, and read generated migrations before running them.
9. **Test with fakes** registered under the real injection tokens.

---

## Not covered: fix these later

- **Passwords are stored as plain text** (in `createUser` and `users.seed.ts`). Hash them with bcrypt or argon2.
- **`login()` never checks the password.** Anyone who knows an email can log in.
- **`JwtAuthGuard` is imported but never used**, so every `/users` route is public, including delete.
- **`updatedAt` never changes.** `onUpdate: "CURRENT_TIMESTAMP"` in `update-utc-column.decorator.ts` only works on MySQL, not Postgres. Switch that decorator to TypeORM's `@UpdateDateColumn`.
- **Timestamps set by the database come back a few hours off.** In testing, users created through the API showed `createdAt` 3 hours earlier than the seeded admin, whose timestamps are set in code. The `timestamp` columns have no timezone, and the transformer reads them in the wrong one. Look at `timestamptz` and at `iso-timestamp-transformer.ts`.
- **A soft-deleted user's profile is still visible** at `GET /profiles/user/:id`.
- **`pnpm lint` reports a floating promise** in `src/database/seeds/run-seeds.ts` (`runSeeds();` should be `await runSeeds();`).
- **`AGENTS.md` says "no fancy ORMs"**, but the project uses TypeORM. Update one of them so they agree.
