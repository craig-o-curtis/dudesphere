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

// One row for each refresh token that has been handed out. A row is kept
// after its token stops working, as a tombstone: a record that the token
// existed and how it ended. The rows of a session are deleted together, 180
// days after the session's end.
//
// A refresh token is what a client swaps for a new access token when the old
// one expires. It works once. Swapping it gives the client a new refresh
// token, a successor, and marks this one used.
//
// All the tokens that descend from one login share a `sessionId`. Those
// rows together are the session: logging out revokes all of them, and so
// does a second use of a token, because then two parties hold it. The
// NestJS docs call this group a "token family".
//
// The columns follow the refresh token entity in the NestJS authentication
// docs, with two names changed: `sessionId` and `sessionExpiresAt` are
// `familyId` and `familyExpiresAt` there. SessionsService decides what the
// rows mean; RefreshTokensService reads and writes them.
//
// The index on (sessionId, revoked) serves the two questions asked of a
// session on every request: is any row of it not past its end, and is any
// row of it revoked. See RefreshTokensService.isSessionLive.
@Entity("refresh_token")
@Index(["sessionId", "revoked"])
export class RefreshToken {
  // The SHA-256 hash of the token, as 64 hex characters. Never the token, so
  // someone who reads the table cannot use what they find. It is the primary
  // key because a token is always looked up by its hash.
  @PrimaryColumn({ type: "varchar", length: 64 })
  id: string;

  // The session this token belongs to. One per login, shared by every
  // successor. The access token carries the same value as its `sid` claim,
  // which is how JwtAuthGuard can tell that a session has ended.
  @Column({ type: "uuid" })
  sessionId: string;

  // Indexed: "log out everywhere" revokes a member's rows by this.
  @Index()
  @Column({ type: "int" })
  userId: number;

  // `user` is the related User object; the foreign-key value is stored in the
  // `userId` column above.
  //
  // RESTRICT: Postgres refuses to hard delete a user row while that user
  // still has rows here. A cascade would take the tombstones with the user
  // and wipe the record they are kept for. Whatever removes a user for real
  // has to remove these rows first, on purpose.
  @ManyToOne(() => User, {
    onDelete: "RESTRICT",
    nullable: false,
  })
  @JoinColumn({ name: "userId" })
  user: Relation<User>;

  // This one token stops working at this instant. Each successor gets a new
  // one, so a member who keeps coming back stays logged in. It is never later
  // than sessionExpiresAt.
  @UtcColumn()
  expiresAt: string;

  // The session ends at this instant, however often it was renewed. Set at
  // login and copied to every successor. Indexed: the rows of a session
  // are deleted by this, 180 days after it. See RefreshTokensService.save.
  @Index()
  @UtcColumn()
  sessionExpiresAt: string;

  // When the token was swapped for its successor. Null until then. A token
  // with a value here that turns up again is being used a second time.
  //
  // A spent row stays as long as its session's rows do, so a second use is
  // caught for the whole life of the session.
  @UtcColumn({ nullable: true })
  usedAt: string | null;

  // A session is revoked when any of its rows is. The rows are kept, not
  // deleted, for two reasons. A successor saved a moment after the revocation
  // is still covered. And a revoked token can be told from one that never
  // existed.
  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @CreateUtcColumn()
  createdAt: string;
}

// SQL equivalent. The column names are camelCase, as TypeORM writes them, so
// each needs double quotes. The real index and constraint names are hashes
// that TypeORM generates; the names here are only for reading.
// CREATE TABLE refresh_token (
//     "id"              VARCHAR(64) PRIMARY KEY,
//     "sessionId"        UUID NOT NULL,
//     "userId"          INTEGER NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
//     "expiresAt"       TIMESTAMPTZ NOT NULL,
//     "sessionExpiresAt" TIMESTAMPTZ NOT NULL,
//     "usedAt"          TIMESTAMPTZ,
//     "revoked"         BOOLEAN NOT NULL DEFAULT false,
//     "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// -- Composite: is any row of the session not past its end, and is any row
// -- of it revoked (RefreshTokensService.isSessionLive)
// CREATE INDEX idx_refresh_token_session_id_revoked
//     ON refresh_token ("sessionId", "revoked");

// -- "Log out everywhere" revokes a member's rows by userId
// CREATE INDEX idx_refresh_token_user_id
//     ON refresh_token ("userId");

// -- Deleting the rows of sessions that ended 180 days ago
// CREATE INDEX idx_refresh_token_session_expires_at
//     ON refresh_token ("sessionExpiresAt");
