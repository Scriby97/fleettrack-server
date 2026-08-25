import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import {
  SubscriptionTier,
  SubscriptionStatus,
} from './enums/subscription-tier.enum';
import {
  SUBSCRIPTION_LIMITS,
  SubscriptionLimits,
} from './constants/subscription-limits.constant';

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
   * Die Tarif-Limits (maxVehicles/maxMembers) der aktuellen Subscription einer
   * Organisation - für die Durchsetzung beim Anlegen von Fahrzeugen/Invites.
   */
  async getLimits(organizationId: string): Promise<SubscriptionLimits> {
    const subscription = await this.findByOrganization(organizationId);
    return SUBSCRIPTION_LIMITS[subscription.tier];
  }

  /**
   * Für Stripe-Webhooks, die keine organizationId mitliefern (z.B. wenn die
   * Subscription über den Customer Portal statt über unseren eigenen Flow
   * geändert wurde) - Lookup über die eindeutige stripeSubscriptionId-Spalte
   * als Fallback zu den Subscription-Metadaten.
   */
  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<OrganizationSubscriptionEntity | null> {
    return this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId },
    });
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
   * Legt eine Subscription direkt auf einem bezahlten Tier an (statt erst auf
   * Lieutenant und dann upzugraden) - für die Selfservice-Organisationserstellung,
   * bei der die Organisation selbst erst nach erfolgreicher Zahlung entsteht.
   */
  async createPaid(
    organizationId: string,
    tier: SubscriptionTier,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = this.subscriptionRepository.create({
      organizationId,
      tier,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId,
      stripeSubscriptionId,
    });
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

  /**
   * Übernimmt Tier/Status/Laufzeit aus einem customer.subscription.updated Webhook.
   * status wird von Stripes granularerem Subscription-Status auf unsere drei
   * Werte (active/past_due/canceled) abgebildet - unbekannte/andere Stripe-Status
   * (z.B. "incomplete", "trialing") werden konservativ als "active" behandelt,
   * da der Zugriff in diesen Fällen normalerweise nicht sofort entzogen werden soll.
   */
  async syncFromStripeSubscription(
    organizationId: string,
    tier: SubscriptionTier,
    stripeStatus: string,
    currentPeriodStart?: Date,
    currentPeriodEnd?: Date,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = tier;
    subscription.status =
      stripeStatus === 'past_due' || stripeStatus === 'unpaid'
        ? SubscriptionStatus.PAST_DUE
        : stripeStatus === 'canceled'
          ? SubscriptionStatus.CANCELED
          : SubscriptionStatus.ACTIVE;
    if (currentPeriodStart)
      subscription.currentPeriodStart = currentPeriodStart;
    if (currentPeriodEnd) subscription.currentPeriodEnd = currentPeriodEnd;
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Zahlung fehlgeschlagen (invoice.payment_failed): Status auf past_due setzen,
   * Tier bewusst NICHT sofort herabstufen - Stripes Smart Retries geben dem Kunden
   * eine Kulanzfrist, in der er seine Zahlungsmethode aktualisieren kann.
   */
  async markPastDue(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.status = SubscriptionStatus.PAST_DUE;
    return this.subscriptionRepository.save(subscription);
  }

  /**
   * customer.subscription.deleted: die Stripe-Subscription existiert nicht mehr
   * (endgültig gekündigt oder nach wiederholt fehlgeschlagenen Zahlungen storniert).
   * Organisation fällt zurück auf Lieutenant (Free) - stripeCustomerId und die
   * (jetzt inaktive) stripeSubscriptionId bleiben als historischer Verweis erhalten
   * (für ein späteres Re-Upgrade legt createCheckoutSession bei Bedarf ohnehin eine
   * neue Subscription an; TypeORM würde ein explizites `undefined` beim Löschen
   * still ignorieren statt NULL zu speichern, daher hier bewusst nicht geleert).
   */
  async downgradeToFree(
    organizationId: string,
  ): Promise<OrganizationSubscriptionEntity> {
    const subscription = await this.findByOrganization(organizationId);
    subscription.tier = SubscriptionTier.LIEUTENANT;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.canceledAt = new Date();
    return this.subscriptionRepository.save(subscription);
  }
}
