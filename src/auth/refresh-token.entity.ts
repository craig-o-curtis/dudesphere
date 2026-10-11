import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";
import { User } from "../users/user.entity.js";

// One row for each refresh token that has been handed out and whose session
// has not yet run out.
//
// A refresh token is what a client swaps for a new access token when the old
// one expires. It works once. Swapping it gives the client a new refresh
// token, a successor, and marks this one used.
//
// All the tokens that descend from one sign-in share a `familyId`. That
// family is the session: signing out revokes the family, and so does a
// second use of a token, because then two parties hold it.
//
// The columns follow the refresh token entity in the NestJS authentication
// docs. TokenService decides what the rows mean; RefreshTokensService reads
// and writes them.
//
// The index on (familyId, revoked) serves the two questions asked of a
// session on every request: is any row of it not past its end, and is any
// row of it revoked. See RefreshTokensService.isSessionLive.
@Entity("refresh_token")
@Index(["familyId", "revoked"])
export class RefreshToken {
  // The SHA-256 hash of the token, as 64 hex characters. Never the token, so
  // someone who reads the table cannot use what they find. It is the primary
  // key because a token is always looked up by its hash.
  @PrimaryColumn({ type: "varchar", length: 64 })
  id: string;

  // The session this token belongs to. One per sign-in, shared by every
  // successor. The access token carries the same value as its `sid` claim,
  // which is how JwtAuthGuard can tell that a session has ended.
  @Column({ type: "uuid" })
  familyId: string;

  // Indexed: "sign out everywhere" revokes a member's rows by this.
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

  // This one token stops working at this instant. Each successor gets a new
  // one, so a member who keeps coming back stays signed in. It is never later
  // than familyExpiresAt.
  @UtcColumn()
  expiresAt: string;

  // The session ends at this instant, however often it was renewed. Set at
  // sign-in and copied to every successor. Indexed: rows past it are cleared
  // out by this.
  @Index()
  @UtcColumn()
  familyExpiresAt: string;

  // When the token was swapped for its successor. Null until then. A token
  // with a value here that turns up again is being used a second time.
  @UtcColumn({ nullable: true })
  usedAt: string | null;

  // A family is revoked when any of its rows is. The rows are kept, not
  // deleted, for two reasons. A successor saved a moment after the revocation
  // is still covered. And a revoked token can be told from one that never
  // existed.
  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @CreateUtcColumn()
  createdAt: string;
}
