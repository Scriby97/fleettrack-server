import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'usages' })
export class UsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @Column({ type: 'integer' })
  startOperatingHours: number;

  @Column({ type: 'integer' })
  endOperatingHours: number;

  @Column({ type: 'integer', default: 0 })
  fuelLitersRefilled: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  creationDate: Date;
}
