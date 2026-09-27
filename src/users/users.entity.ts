import { Exclude } from "class-transformer";
import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity("users")
export class UserEntity {
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

  @Column({ default: false })
  isDude: boolean;

  @Column({
    type: "timestamp",
    nullable: true,
    transformer: {
      to: (value: Date) => value?.toISOString() ?? null,
      from: (value: string) => value ?? null,
    },
  })
  createdAt: string | null;
}
