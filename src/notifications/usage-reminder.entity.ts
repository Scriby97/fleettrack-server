import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('usage_reminders')
export class UsageReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ default: true })
  enabled: boolean;

  // Format "HH:mm", ausgewertet in der Zeitzone der timezone-Spalte.
  @Column({ default: '20:30' })
  reminderTime: string;

  @Column({ default: 'Europe/Zurich' })
  timezone: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
