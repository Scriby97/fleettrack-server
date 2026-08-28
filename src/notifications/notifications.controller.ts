import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AppBadRequestException, ErrorCode } from '../common/exceptions';

@Controller('notifications')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('reminder')
  getReminder(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getReminder(user.id);
  }

  @Put('reminder')
  updateReminder(@CurrentUser() user: AuthUser, @Body() dto: UpdateReminderDto) {
    return this.notificationsService.updateReminder(user.id, dto.enabled, dto.time);
  }

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  }

  @Post('push-subscription')
  addSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    return this.notificationsService.addSubscription(user.id, dto);
  }

  @Delete('push-subscription')
  async removeSubscription(
    @CurrentUser() user: AuthUser,
    @Query('endpoint') endpoint?: string,
  ) {
    if (!endpoint) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'endpoint ist erforderlich',
      );
    }
    await this.notificationsService.removeSubscription(user.id, endpoint);
    return { message: 'Subscription entfernt' };
  }
}
