import { Exclude } from "class-transformer";
import { Check, Column, Entity, OneToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";

import { Profile } from "../profiles/profile.entity.js";
import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { SoftDeleteUtcColumn } from "../shared/decorators/soft-delete-utc-column.decorator.js";
import { UpdateUtcColumn } from "../shared/decorators/update-utc-column.decorator.js";
import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}

// Entities are for database schema and should not contain business logic
// TypeORM will automatically create the table and columns based on the entity definition
// must be singular because TypeORM will add `s` for the table
// Also used for creating new records. Needs to be in-sync with create-user.dto.ts (used for validation)
//
// The three checks are the database's own copy of rules CreateUserDto already
// applies, so a writer that skips the DTO, such as the seed, cannot break them.
// The InitialSchema migration creates them under these names.
@Entity("user")
@Check("CHK_user_username_length", `char_length("username") <= 24`)
@Check("CHK_user_email_length", `char_length("email") <= 100`)
// No "@", so login can tell a username from an email. No whitespace, so login
// can trim what the caller typed.
@Check("CHK_user_username_characters", `"username" !~ '[[:space:]@]'`)
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  // citext compares without regard to case, so "Walter" and "walter" are the
  // same username, and unique refuses the second. The value is stored as
  // typed. citext has no length, so the checks above hold the limits.
  @Column({ type: "citext", nullable: false, unique: true })
  username: string;

  @Column({ type: "citext", nullable: false, unique: true })
  email: string;

  @Column({ type: "varchar", length: 255 })
  @Exclude()
  password: string;

  @Column({ type: "simple-enum", enum: UserRole, default: UserRole.USER })
  role: UserRole;

  // When the password was last changed or reset. Null for a member who still
  // has the password they signed up with.
  //
  // An access token issued before this moment is refused, so changing a
  // password signs out every device that was signed in with the old one,
  // including one a thief is using. UsersService.updateUser and
  // PasswordResetMailer.updatePassword set it, and JwtAuth.validate checks it.
  @UtcColumn({ nullable: true })
  @Exclude()
  passwordChangedAt: string | null;

  @OneToOne(() => Profile, (profile) => profile.user) // one-to-one relation with Profile entity, Profile is the owner of the relation
  // THe SQL equivalent here is `FOREIGN KEY (profileId) REFERENCES profile(id) ON DELETE CASCADE`
  // the user object actually returns the profile object,
  // but the profile object does not return the user object.
  // This is because the profile object is the owner of the relation,
  // and the user object is the inverse side of the relation.
  profile?: Relation<Profile>;

  // Auto-set once on row creation
  @CreateUtcColumn()
  createdAt: string;

  // Auto-set on creation, auto-update on every change
  @UpdateUtcColumn()
  updatedAt: string;

  // Soft delete column — set by TypeORM softDelete(), transformer prevents Date leakage
  @SoftDeleteUtcColumn()
  deletedAt: string | null;
}

// SQL equivalent
// CREATE EXTENSION IF NOT EXISTS citext;

// CREATE TABLE "user" (
//     id                 SERIAL PRIMARY KEY,
//     username           CITEXT NOT NULL,
//     email              CITEXT NOT NULL,
//     password           VARCHAR(255) NOT NULL,
//     role               VARCHAR(255) NOT NULL DEFAULT 'user',
//     "passwordChangedAt" TIMESTAMPTZ,
//     "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
//     "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
//     "deletedAt"        TIMESTAMPTZ
// );

// -- Unique (case-insensitive thanks to citext)
// ALTER TABLE "user"
//     ADD CONSTRAINT uq_user_username UNIQUE (username),
//     ADD CONSTRAINT uq_user_email UNIQUE (email);

// -- The @Check constraints, with the names from the entity
// ALTER TABLE "user"
//     ADD CONSTRAINT CHK_user_username_length
//         CHECK (char_length("username") <= 24),
//     ADD CONSTRAINT CHK_user_email_length
//         CHECK (char_length("email") <= 100),
//     ADD CONSTRAINT CHK_user_username_characters
//         CHECK ("username" !~ '[[:space:]@]');

// -- simple-enum → varchar backed by a CHECK, so the DB rejects values the enum doesn't have
// ALTER TABLE "user"
//     ADD CONSTRAINT CHK_user_role
//         CHECK (role IN ('admin', 'user'));

// CREATE OR REPLACE FUNCTION set_updated_at()
// RETURNS trigger AS $$
// BEGIN
//     NEW."updatedAt" := now();
//     RETURN NEW;
// END;
// $$ LANGUAGE plpgsql;

// CREATE TRIGGER trg_user_updated_at
//     BEFORE UPDATE ON "user"
//     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
