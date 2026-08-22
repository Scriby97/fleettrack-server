import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { OrganizationMemberEntity } from './organization-member.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';

@Entity('organizations')
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true, unique: true })
  subdomain?: string; // z.B. "firma1" für firma1.fleettrack.com

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  contactEmail?: string;

  @OneToMany(() => OrganizationMemberEntity, (member) => member.organization)
  members!: OrganizationMemberEntity[];

  @OneToMany(() => VehicleEntity, (vehicle) => vehicle.organization)
  vehicles!: VehicleEntity[];

  @OneToOne(() => OrganizationSubscriptionEntity, (subscription) => subscription.organization)
  subscription?: OrganizationSubscriptionEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
