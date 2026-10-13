import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { CreateUtcColumn } from "../../shared/decorators/create-utc-column.decorator.js";
import { UtcColumn } from "../../shared/decorators/utc-column.decorator.js";
import { User } from "../../users/user.entity.js";

// One row for each login. That is what a session is: one login on one
// device, from the moment the password was checked until the member logs
// out or the session runs out.
//
// A session has many refresh tokens, one for each time it was renewed. They
// are in the refresh_token table, and each points back here.
//
// Everything about whether a session is over is on this one row:
//
// - `expiresAt` has passed: it ran out by itself.
// - `revokedAt` is set: it was ended on purpose.
//
// A row is kept after its session is over, as a record of it. It is deleted
// 180 days after `expiresAt`, and its refresh tokens go with it.
@Entity("session")
export class Session {
  // A random UUID, made by the app at login. The access token carries it as
  // its `sid` claim, which is how JwtAuthGuard finds this row on every
  // request.
  @PrimaryColumn({ type: "uuid" })
  id: string;

  // Whose session it is. Indexed: "log out everywhere" ends a member's
  // sessions by this.
  @Index()
  @Column({ type: "int" })
  userId: number;

  // `user` is the related User object; the foreign-key value is stored in the
  // `userId` column above.
  //
  // RESTRICT: Postgres refuses to hard delete a user row while that user
  // still has rows here. A cascade would take the record with the user.
  // Whatever removes a user for real has to remove these rows first, on
  // purpose.
  @ManyToOne(() => User, {
    onDelete: "RESTRICT",
    nullable: false,
  })
  @JoinColumn({ name: "userId" })
  user: Relation<User>;

  // The session ends at this instant, however often it was renewed. Set at
  // login, 30 days ahead, and never moved. Indexed: old rows are deleted by
  // this.
  @Index()
  @UtcColumn()
  expiresAt: string;

  // When the session was ended on purpose: a logout, a password change, a
  // closed account, or a refresh token used twice. Null for a session nobody
  // ended. Set once and never changed, so the first reason's time is kept.
  @UtcColumn({ nullable: true })
  revokedAt: string | null;

  @CreateUtcColumn()
  createdAt: string;
}

// SQL equivalent. The column names are camelCase, as TypeORM writes them, so
// each needs double quotes. The real index and constraint names are hashes
// that TypeORM generates; the names here are only for reading.
// CREATE TABLE session (
//     "id"         UUID PRIMARY KEY,
//     "userId"     INTEGER NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
//     "expiresAt"  TIMESTAMPTZ NOT NULL,
//     "revokedAt"  TIMESTAMPTZ,
//     "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// -- "Log out everywhere" ends a member's sessions by userId
// CREATE INDEX idx_session_user_id
//     ON session ("userId");

// -- Deleting the sessions that ended 180 days ago
// CREATE INDEX idx_session_expires_at
//     ON session ("expiresAt");
