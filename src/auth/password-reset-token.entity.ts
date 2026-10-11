import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";
import { User } from "../users/user.entity.js";

// One row for each password reset link that can still be used.
//
// The link carries a random token. This table holds only the SHA-256 hash of
// it, never the token, so someone who reads the table cannot build a working
// link from it. PasswordResetService deletes the row when the link is used,
// which is what makes a link work once.
@Entity("password_reset_token")
export class PasswordResetToken {
  @PrimaryGeneratedColumn()
  id: number;

  // Indexed: asking for a new link deletes the user's earlier ones by this.
  @Index()
  @Column({ type: "int" })
  userId: number;

  // `user` is the related User object; the foreign-key value is stored in the
  // `userId` column above.
  @ManyToOne(() => User, {
    onDelete: "CASCADE", // when the user row is hard deleted, Postgres deletes these rows too
    nullable: false,
  })
  @JoinColumn({ name: "userId" })
  user: Relation<User>;

  // 64 hex characters: a SHA-256 hash. Unique, so a lookup by hash finds at
  // most one row, and the unique index is what serves that lookup.
  @Column({ type: "varchar", length: 64, unique: true })
  tokenHash: string;

  // The link stops working at this instant.
  @UtcColumn()
  expiresAt: string;

  @CreateUtcColumn()
  createdAt: string;
}
