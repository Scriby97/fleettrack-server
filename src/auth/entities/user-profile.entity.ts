import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrganizationMemberEntity } from '../../organizations/organization-member.entity';

@Entity('user_profiles')
export class UserProfileEntity {
  @PrimaryColumn('uuid')
  id!: string; // Gleiche ID wie Supabase Auth User

  @Column({ unique: true })
  email!: string;

  @Column({ default: 'user' })
  role!: string; // 'user' oder 'administrator'

  @OneToMany(
    () => OrganizationMemberEntity,
    (membership) => membership.user,
  )
  organizationMemberships!: OrganizationMemberEntity[];

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
