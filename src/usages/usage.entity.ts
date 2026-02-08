import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';

@Entity({ name: 'usages' })
export class UsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => VehicleEntity, { nullable: false })
  @JoinColumn({ name: 'vehicleId' })
  vehicle: VehicleEntity;

  @Column({ type: 'uuid' })
  creatorId: string;

  @ManyToOne(() => UserProfileEntity, { nullable: false })
  @JoinColumn({ name: 'creatorId' })
  creator: UserProfileEntity;

  @Column({ type: 'decimal', precision: 10, scale: 1 })
  startOperatingHours: number;

  @Column({ type: 'decimal', precision: 10, scale: 1 })
  endOperatingHours: number;

  @Column({ type: 'integer', default: 0 })
  fuelLitersRefilled: number;

  @Column({
    type: 'bigint',
    default: () => '(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  creationDate: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  usageDate: Date;
}
