import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { SoftDeleteUtcColumn } from "../shared/decorators/soft-delete-utc-column.decorator.js";
import { UpdateUtcColumn } from "../shared/decorators/update-utc-column.decorator.js";
import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";
import { User } from "../users/user.entity.js";

// The check is the database's own copy of a rule CreateProfileDto already
// applies, so a writer that skips the DTO, such as the seed, cannot break it.
// The name matches the migration ProfileDisplayName.
@Entity("profile")
@Check("CHK_profile_displayName_length", `char_length("displayName") <= 50`)
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  // The foreign key column. It lives on this table because Profile is the "owning side".
  @Column({ type: "int" })
  userId: number;

  @OneToOne(() => User, (user) => user.profile, {
    onDelete: "CASCADE", // when the user row is hard deleted, Postgres deletes this row too
    nullable: false, // a profile can never exist without a user
  }) // one-to-one relation with User entity, User is the owner of the relation
  @JoinColumn({ name: "userId" }) // creates FK on this table, so the userId column is the FK to user.id
  // the SQL equivalent here is `FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE`
  user: Relation<User>;

  // The one name other members see: on the profile and on every abiding. A
  // username is a login name and is shown to nobody else.
  //
  // citext compares without regard to case, so "The Dude" and "the dude" are
  // the same name, and unique refuses the second. The value is stored as
  // typed. citext has no length, so the check above holds the limit.
  @Column({ type: "citext", nullable: false, unique: true })
  displayName: string;

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

  // Auto-set on deletion
  @SoftDeleteUtcColumn()
  deletedAt: string | null;
}

// SQL equivalent
// CREATE TABLE profile (
//     id               SERIAL PRIMARY KEY,
//     user_id          INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
//     "displayName"    CITEXT NOT NULL,
//     bio              TEXT,
//     "profileImageUrl" VARCHAR(255),
//     "isDude"         BOOLEAN NOT NULL DEFAULT false,
//     "ordainedDate"   TIMESTAMPTZ,
//     "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
//     "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
//     "deletedAt"      TIMESTAMPTZ
// );

// -- One-to-one: the FK itself must be unique, otherwise a user could
// -- have several profiles and it'd just be a many-to-one
// ALTER TABLE profile
//     ADD CONSTRAINT uq_profile_user_id UNIQUE (user_id),
//     ADD CONSTRAINT uq_profile_displayName UNIQUE ("displayName"),
//     ADD CONSTRAINT CHK_profile_displayName_length
//         CHECK (char_length("displayName") <= 50);

// CREATE TRIGGER trg_profile_updated_at
//     BEFORE UPDATE ON profile
//     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
