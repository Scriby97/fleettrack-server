import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'vehicles' })
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  plate: string;

  @Column()
  snowsatNumber: string;

  @Column({ type: 'boolean', default: false })
  isRetired: boolean;

  @Column({ type: 'text', nullable: true })
  location?: string;

  @Column({ type: 'text', nullable: true })
  vehicleType?: string;

  @Column({ type: 'text', nullable: true })
  fuelType?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, (org) => org.vehicles)
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;
}