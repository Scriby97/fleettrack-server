import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeService } from './stripe.service';
import { BillingController } from './billing.controller';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import { OrganizationSubscriptionEntity } from '../organizations/organization-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationSubscriptionEntity])],
  controllers: [BillingController],
  providers: [StripeService, OrganizationSubscriptionsService],
  exports: [StripeService],
})
export class BillingModule {}
