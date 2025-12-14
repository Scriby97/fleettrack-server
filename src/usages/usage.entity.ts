import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'usages' })
export class UsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vehicleId: string;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endTime?: Date;

  @Column({ type: 'integer', default: 0 })
  fuelLitersRefilled: number;
}
