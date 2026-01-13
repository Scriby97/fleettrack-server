import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';

@Entity('user_profiles')
export class UserProfileEntity {
  @PrimaryColumn('uuid')
  id: string; // Gleiche ID wie Supabase Auth User

  @Column({ unique: true })
  email: string;

  @Column({ default: 'user' })
  role: string; // 'super_admin', 'admin' oder 'user'

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => OrganizationEntity, (org) => org.users, { nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization?: OrganizationEntity;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
