import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageReminderEntity } from './usage-reminder.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { UsageEntity } from '../usages/usage.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageReminderEntity, PushSubscriptionEntity, UsageEntity]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ReminderSchedulerService],
})
export class NotificationsModule {}
