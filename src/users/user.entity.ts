import { Exclude } from "class-transformer";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

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
    length: 100,
  })
  @Index()
  name: string;

  @Column({ type: "varchar", nullable: false, length: 100, unique: true })
  @Index()
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({ type: "simple-enum", enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: false })
  isDude: boolean;

  // Optional date when the user was ordained as a dude priest (ISO 8601 UTC string)
  @Column({ type: "timestamp", nullable: true })
  ordainedDate: string | null;

  @CreateDateColumn({
    type: "timestamp",
    transformer: {
      // oxlint-disable-next-line no-new-date — TypeORM transformer requires Date conversion
      to: (value: string) => new Date(value),
      from: (value: Date) => value.toISOString(),
    },
  })
  createdAt: string;

  @UpdateDateColumn({
    type: "timestamp",
    transformer: {
      // oxlint-disable-next-line no-new-date — TypeORM transformer requires Date conversion
      to: (value: string) => new Date(value),
      from: (value: Date) => value.toISOString(),
    },
  })
  updatedAt: string;
}
