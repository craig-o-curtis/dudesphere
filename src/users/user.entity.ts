import { Exclude } from "class-transformer";
import { Column, Entity, Index, OneToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";

import { Profile } from "../profile/profile.entity.js";
import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { SoftDeleteUtcColumn } from "../shared/decorators/soft-delete-utc-column.decorator.js";
import { UpdateUtcColumn } from "../shared/decorators/update-utc-column.decorator.js";

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}

// Entities are for database schema and should not contain business logic
// TypeORM will automatically create the table and columns based on the entity definition
// must be singular because TypeORM will add `s` for the table
// Also used for creating new records. Needs to be in-sync with create-user.dto.ts (used for validation)
@Entity("user")
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "varchar",
    nullable: false,
    length: 24,
    unique: true,
  })
  @Index()
  username: string;

  @Column({ type: "varchar", nullable: false, length: 100, unique: true })
  @Index()
  email: string;

  @Column({ type: "varchar", length: 255 })
  @Exclude()
  password: string;

  @Column({ type: "simple-enum", enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @OneToOne(() => Profile, (profile) => profile.user)
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
