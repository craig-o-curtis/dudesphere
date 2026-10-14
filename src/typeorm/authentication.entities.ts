import type { EmailTokenPurpose, MfaState } from "@nestjs/authentication";
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";

// The tables @nestjs/authentication keeps its state in, read and written by
// TypeOrmAuthenticationStore. They are the docs' entities, from "Keep
// sessions and tokens in your database" on
// https://docs.nestjs.com/security/authentication, with one change: times
// are ISO strings through UtcColumn, as in every other table here. The
// package passes Date objects, and the store converts at its edge, so no
// Date reaches the rest of the app.
//
// `user_id` is text with no foreign key, as in the docs. The package passes
// user ids as strings, and its store contract tests with ids such as
// "user-<uuid>", which an integer column would refuse. Our ids are written
// as String(user.id). Users are only soft-deleted, so no row is orphaned. A
// real delete of a user must delete that user's rows here first.
//
// Only the three tables this app uses are here: sessions, refresh tokens and
// email links. The docs' tables for two-factor codes, magic links and Google
// sign-in wait until those features are wanted.
//
// Tokens, links and sessions are stored by their SHA-256, never as
// themselves.

/** What a `jsonb` column holds: a column typed `unknown` doesn't fit TypeORM's insert types. */
export type Json = object | string | number | boolean | null;

// Browser sessions, signed in with a cookie. The API hands out bearer tokens
// only, so nothing creates a row here yet. The package still needs the table:
// a password reset ends every session of the member, and so does a sign-out
// everywhere.
@Entity("sessions")
@Index("sessions_user_id_idx", ["userId"])
@Index("sessions_expires_at_idx", ["expiresAt"])
export class SessionEntity {
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ type: "text", name: "user_id" })
  userId: string;

  @UtcColumn({ name: "created_at" })
  createdAt: string;

  @UtcColumn({ name: "expires_at" })
  expiresAt: string;

  @UtcColumn({ name: "last_active_at" })
  lastActiveAt: string;

  @Column({ type: "text", nullable: true })
  mfa: MfaState | null;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, Json> | null;
}

// One row for each refresh token. The tokens of one sign-in share a family
// id, and each use of a token adds its successor to the family.
@Entity("refresh_tokens")
@Index("refresh_tokens_family_id_idx", ["familyId"])
@Index("refresh_tokens_user_id_idx", ["userId"])
@Index("refresh_tokens_family_expires_at_idx", ["familyExpiresAt"])
export class RefreshTokenEntity {
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ type: "text", name: "family_id" })
  familyId: string;

  @Column({ type: "text", name: "user_id" })
  userId: string;

  @UtcColumn({ name: "created_at" })
  createdAt: string;

  @UtcColumn({ name: "expires_at" })
  expiresAt: string;

  @UtcColumn({ name: "family_expires_at" })
  familyExpiresAt: string;

  @UtcColumn({ name: "used_at", nullable: true })
  usedAt: string | null;

  // A family is revoked when any of its tokens is: that covers a successor saved after the revocation.
  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @Column({ type: "jsonb", nullable: true })
  claims: Record<string, Json> | null;
}

// Password reset links, and later email verification links.
@Entity("email_tokens")
@Index("email_tokens_user_id_purpose_idx", ["userId", "purpose"])
@Index("email_tokens_expires_at_idx", ["expiresAt"])
export class EmailTokenEntity {
  @PrimaryColumn({ type: "text" })
  id: string;

  @Column({ type: "text" })
  purpose: EmailTokenPurpose;

  @Column({ type: "text", name: "user_id" })
  userId: string;

  @Column({ type: "text" })
  email: string;

  @Column({ type: "text", nullable: true })
  fingerprint: string | null;

  @UtcColumn({ name: "created_at" })
  createdAt: string;

  @UtcColumn({ name: "expires_at" })
  expiresAt: string;
}
