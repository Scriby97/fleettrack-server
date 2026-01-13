import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';

@Entity('organizations')
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, unique: true })
  subdomain?: string; // z.B. "firma1" für firma1.fleettrack.com

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  contactEmail?: string;

  @OneToMany(() => UserProfileEntity, (user) => user.organization)
  users: UserProfileEntity[];

  @OneToMany(() => VehicleEntity, (vehicle) => vehicle.organization)
  vehicles: VehicleEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
