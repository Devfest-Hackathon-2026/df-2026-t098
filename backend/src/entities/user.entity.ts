import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('UQ_users_email_normalized', { synchronize: false })
@Index('UQ_users_username_normalized', { synchronize: false })
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  google_id!: string | null;

  @Column({ nullable: false })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  password_hash!: string | null;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatar_url!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  email_verified_at!: Date | null;

  @CreateDateColumn({ nullable: false })
  created_at!: Date;

  @UpdateDateColumn({ nullable: false })
  updated_at!: Date;
}
