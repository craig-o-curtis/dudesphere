import {
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

@Entity("profile")
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

  // Auto-set on deletion
  @SoftDeleteUtcColumn()
  deletedAt: string | null;
}
