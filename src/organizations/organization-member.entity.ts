import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { UserProfileEntity } from '../../auth/entities/user-profile.entity';
import { OrganizationEntity } from '../organization.entity';

/**
 * Junction table for user-organization memberships
 * Allows users to belong to multiple organizations with different roles in each
 */
@Entity('organization_members')
@Unique('unique_user_org_membership', ['userId', 'organizationId'])
@Index('idx_org_members_user', ['userId'])
@Index('idx_org_members_org', ['organizationId'])
@Index('idx_org_members_role', ['role'])
export class OrganizationMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(
    () => UserProfileEntity,
    (user) => user.organizationMemberships,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'userId' })
  user: UserProfileEntity;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(
    () => OrganizationEntity,
    (org) => org.members,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;

  @Column({ default: 'employee' })
  role: string; // 'employee', 'admin', 'owner'

  @CreateDateColumn()
  joinedAt: Date;
}
