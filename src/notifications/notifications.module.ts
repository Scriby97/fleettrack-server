import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageReminderEntity } from './usage-reminder.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { UsageEntity } from '../usages/usage.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  imports: [
    // UserProfileEntity wird hier (zusaetzlich zu AuthModule) registriert,
    // weil @UseGuards(SupabaseAuthGuard) im Controller eine eigene Instanz
    // des Guards in DIESEM Modul-Kontext erzeugt - dessen
    // UserProfileEntityRepository-Abhaengigkeit muss deshalb lokal aufloesbar
    // sein (siehe OrganizationsModule fuer das gleiche Muster).
    TypeOrmModule.forFeature([
      UsageReminderEntity,
      PushSubscriptionEntity,
      UsageEntity,
      UserProfileEntity,
    ]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ReminderSchedulerService],
})
export class NotificationsModule {}
