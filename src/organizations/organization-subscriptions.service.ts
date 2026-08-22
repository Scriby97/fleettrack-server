import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import {
  SubscriptionTier,
  SubscriptionStatus,
} from './enums/subscription-tier.enum';

@Injectable()
export class OrganizationSubscriptionsService {
  constructor(
    @InjectRepository(OrganizationSubscriptionEntity)
    private readonly subscriptionRepository: Repository<OrganizationSubscriptionEntity>,
  ) {}

  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) {
      throw new NotFoundException(
        'No subscription found for this organization',
      );
    }

    return subscription;
  }

  /**
   * Legt die Free-Subscription (Lieutenant) für eine neu erstellte Organisation an
   */
  async createDefault(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = this.subscriptionRepository.create({
      organizationId,
      tier: SubscriptionTier.LIEUTENANT,
      status: SubscriptionStatus.ACTIVE,
    });
    return this.subscriptionRepository.save(subscription);
  }

  async updateTier(
    organizationId: string,
    tier: SubscriptionTier,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = tier;
    subscription.status = SubscriptionStatus.ACTIVE;
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Aktiviert einen bezahlten Tier nach erfolgreichem Stripe Checkout (Webhook)
   */
  async activatePaidTier(
    organizationId: string,
    tier: SubscriptionTier,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = tier;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.stripeCustomerId = stripeCustomerId;
    subscription.stripeSubscriptionId = stripeSubscriptionId;
    return this.subscriptionRepository.save(subscription);
  }
}
