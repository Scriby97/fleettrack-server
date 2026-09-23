import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';

@Entity({ name: 'usages' })
@Index('idx_usages_vehicle_usage_date', ['vehicleId', 'usageDate'])
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

  // transformer noetig, weil TypeORM 'decimal' sonst als String zurueckgibt
  // (Praezisionsschutz fuer beliebig grosse Dezimalzahlen) - ohne das crashte
  // z.B. das Frontend beim naechsten .toFixed()-Aufruf auf einer als String
  // zurueckgegebenen Nutzung (siehe PUT /usages/:id, das die raw Entity
  // zurueckgibt statt einer gemappten DTO).
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 1,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  startOperatingHours: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 1,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  endOperatingHours: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
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
