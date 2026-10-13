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
import { Session } from "./session.entity.js";

// One row for each refresh token that has been handed out.
//
// A refresh token is what a client swaps for a new access token when the old
// one expires. It works once. Swapping it gives the client a new refresh
// token, a successor, and marks this one used.
//
// Every token belongs to one session, the login it descends from. A session
// has many of these: its first, and one more for each refresh.
//
// A row is kept after its token stops working, as a tombstone: a record that
// the token existed and when it was used. It is deleted with its session.
//
// Nothing here says whether the session is over. That is on the session
// row. SessionsService decides what the rows mean; SessionsRepository reads
// and writes them.
@Entity("refresh_token")
export class RefreshToken {
  // The SHA-256 hash of the token, as 64 hex characters. Never the token, so
  // someone who reads the table cannot use what they find. It is the primary
  // key because a token is always looked up by its hash.
  @PrimaryColumn({ type: "varchar", length: 64 })
  id: string;

  // The session this token belongs to. Indexed: when a session row is
  // deleted, Postgres finds its tokens by this.
  @Index()
  @Column({ type: "uuid" })
  sessionId: string;

  // `session` is the related Session object; the foreign-key value is stored
  // in the `sessionId` column above.
  //
  // CASCADE: deleting a session row deletes its tokens with it. A token has
  // no meaning without its session, and the two are kept and removed
  // together.
  @ManyToOne(() => Session, {
    onDelete: "CASCADE",
    nullable: false,
  })
  @JoinColumn({ name: "sessionId" })
  session: Relation<Session>;

  // This one token stops working at this instant, 7 days after it was handed
  // out. Each successor gets a new one, so a member who keeps coming back
  // stays logged in. It is never later than the session's own end.
  @UtcColumn()
  expiresAt: string;

  // When the token was swapped for its successor. Null until then. A token
  // with a value here that turns up again is being used a second time.
  @UtcColumn({ nullable: true })
  usedAt: string | null;

  @CreateUtcColumn()
  createdAt: string;
}

// SQL equivalent. The column names are camelCase, as TypeORM writes them, so
// each needs double quotes. The real index and constraint names are hashes
// that TypeORM generates; the names here are only for reading.
// CREATE TABLE refresh_token (
//     "id"         VARCHAR(64) PRIMARY KEY,
//     "sessionId"  UUID NOT NULL REFERENCES session("id") ON DELETE CASCADE,
//     "expiresAt"  TIMESTAMPTZ NOT NULL,
//     "usedAt"     TIMESTAMPTZ,
//     "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// -- Finding a session's tokens, for the cascade when the session is deleted
// CREATE INDEX idx_refresh_token_session_id
//     ON refresh_token ("sessionId");
