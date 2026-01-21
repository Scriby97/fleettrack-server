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

  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => OrganizationEntity, (org) => org.vehicles)
  @JoinColumn({ name: 'organizationId' })
  organization: OrganizationEntity;
}