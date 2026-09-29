import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

import { CreateUtcColumn } from "../shared/decorators/create-utc-column.decorator.js";
import { UpdateUtcColumn } from "../shared/decorators/update-utc-column.decorator.js";
import { UtcColumn } from "../shared/decorators/utc-column.decorator.js";

@Entity("profile")
@Unique(["userId"])
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "int" })
  userId: number;

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
}