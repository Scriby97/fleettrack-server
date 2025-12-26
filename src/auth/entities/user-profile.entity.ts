import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_profiles')
export class UserProfileEntity {
  @PrimaryColumn('uuid')
  id: string; // Gleiche ID wie Supabase Auth User

  @Column({ unique: true })
  email: string;

  @Column({ default: 'user' })
  role: string; // 'admin' oder 'user'

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
