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

  @Column()
  @Index()
  name: string;

  @Column({ unique: true })
  @Index()
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({ type: "simple-enum", enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: false })
  isDude: boolean;

  @CreateDateColumn({
    type: "timestamp",
    transformer: {
      to: (value: string) => new Date(value),
      from: (value: Date) => value.toISOString(),
    },
  })
  createdAt: string;

  @UpdateDateColumn({
    type: "timestamp",
    transformer: {
      to: (value: string) => new Date(value),
      from: (value: Date) => value.toISOString(),
    },
  })
  updatedAt: string;
}
