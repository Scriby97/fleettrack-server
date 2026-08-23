import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionTier } from '../organizations/enums/subscription-tier.enum';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
  }

  private getClientOrThrow(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException(
        'Stripe ist nicht konfiguriert (STRIPE_SECRET_KEY fehlt)',
      );
    }
    return this.stripe;
  }

  private getPriceIdForTier(tier: SubscriptionTier): string {
    const envKey =
      tier === SubscriptionTier.CAPTAIN
        ? 'STRIPE_PRICE_CAPTAIN'
        : 'STRIPE_PRICE_GENERAL';
    const priceId = this.configService.get<string>(envKey);
    if (!priceId) {
      throw new InternalServerErrorException(
        `Stripe Preis für Tier "${tier}" ist nicht konfiguriert (${envKey} fehlt)`,
      );
    }
    return priceId;
  }

  /**
   * Kehrfunktion zu getPriceIdForTier: ermittelt den Tier anhand einer Stripe Price ID.
   * Wird in Webhooks genutzt, um den Tier robust aus dem Subscription-Objekt abzuleiten
   * (zusätzlich zu den Metadaten - falls die Subscription z.B. direkt im Stripe Dashboard
   * auf einen anderen Preis umgestellt wurde).
   */
  getTierForPriceId(
    priceId: string | undefined | null,
  ): SubscriptionTier | null {
    if (!priceId) {
      return null;
    }
    if (priceId === this.configService.get<string>('STRIPE_PRICE_CAPTAIN')) {
      return SubscriptionTier.CAPTAIN;
    }
    if (priceId === this.configService.get<string>('STRIPE_PRICE_GENERAL')) {
      return SubscriptionTier.GENERAL;
    }
    return null;
  }

  private getFrontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  /**
   * Erstellt eine Stripe Checkout Session für ein Subscription-Upgrade.
   * Die Organisation bleibt bis zum erfolgreichen Checkout (Webhook) auf Lieutenant.
   *
   * - automatic_tax + tax_id_collection: Stripe Tax berechnet und weist die MWST/USt
   *   automatisch aus (CH sowie ggf. weitere Länder, sobald in den Tax-Einstellungen
   *   registriert) und lässt B2B-Kunden ihre UID/USt-IdNr. für Reverse-Charge angeben.
   * - subscription_data.metadata: die Metadaten landen NICHT nur auf der Checkout
   *   Session, sondern auch auf der resultierenden Subscription selbst - Voraussetzung
   *   dafür, dass spätere Webhooks (customer.subscription.updated/deleted) organizationId
   *   und tier zuverlässig zuordnen können.
   * - idempotencyKey: verhindert, dass ein Doppel-Klick auf "Upgrade" oder ein Retry
   *   des Frontends zwei parallele Checkout Sessions/Subscriptions für dieselbe
   *   Organisation erzeugt.
   */
  async createCheckoutSession(params: {
    organizationId: string;
    tier: SubscriptionTier;
    customerEmail?: string;
  }): Promise<string> {
    const stripe = this.getClientOrThrow();
    const priceId = this.getPriceIdForTier(params.tier);
    const frontendUrl = this.getFrontendUrl();

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: params.organizationId,
        customer_email: params.customerEmail,
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        billing_address_collection: 'required',
        metadata: {
          organizationId: params.organizationId,
          tier: params.tier,
        },
        subscription_data: {
          metadata: {
            organizationId: params.organizationId,
            tier: params.tier,
          },
        },
        success_url: `${frontendUrl}/onboarding/create-organization/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/onboarding/create-organization?canceled=1`,
      },
      {
        // Pro Organisation + Tier + Minute deduplizieren, ohne spätere legitime
        // Checkouts dauerhaft zu blockieren.
        idempotencyKey: `checkout_${params.organizationId}_${params.tier}_${Math.floor(
          Date.now() / 60_000,
        )}`,
      },
    );

    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe Checkout Session konnte nicht erstellt werden',
      );
    }

    this.logger.log(
      `Checkout Session erstellt: organizationId=${params.organizationId} tier=${params.tier} sessionId=${session.id}`,
    );

    return session.url;
  }

  /**
   * Erstellt eine Stripe Customer Portal Session, damit Kunden ihre Zahlungsmethode,
   * Rechnungen (Invoicing!) und ihr Abo selbst verwalten können, ohne dass wir das
   * nachbauen müssen. Muss einmalig unter dashboard.stripe.com/settings/billing/portal
   * konfiguriert werden (welche Aktionen erlaubt sind: Plan wechseln, kündigen, etc.).
   */
  async createPortalSession(params: {
    stripeCustomerId: string;
    returnUrl?: string;
  }): Promise<string> {
    const stripe = this.getClientOrThrow();
    const session = await stripe.billingPortal.sessions.create({
      customer: params.stripeCustomerId,
      return_url: params.returnUrl ?? `${this.getFrontendUrl()}/settings/billing`,
    });
    return session.url;
  }

  /**
   * Wechselt eine bestehende (bezahlte) Subscription direkt auf einen anderen Tier
   * (Captain <-> General), inkl. Proration. Für den Wechsel von Lieutenant (kein
   * Stripe-Customer/-Subscription vorhanden) muss stattdessen createCheckoutSession
   * verwendet werden.
   */
  async changeSubscriptionTier(params: {
    stripeSubscriptionId: string;
    newTier: SubscriptionTier;
  }): Promise<Stripe.Subscription> {
    const stripe = this.getClientOrThrow();
    const newPriceId = this.getPriceIdForTier(params.newTier);

    const subscription = await stripe.subscriptions.retrieve(
      params.stripeSubscriptionId,
    );
    const currentItem = subscription.items.data[0];
    if (!currentItem) {
      throw new InternalServerErrorException(
        `Stripe Subscription ${params.stripeSubscriptionId} hat kein Subscription-Item`,
      );
    }

    return stripe.subscriptions.update(params.stripeSubscriptionId, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
      metadata: { ...subscription.metadata, tier: params.newTier },
    });
  }

  /**
   * Kündigt eine Subscription zum Ende der aktuellen Periode (kein sofortiger
   * Zugriffsverlust). Die Organisation fällt erst zurück auf Lieutenant, wenn Stripe
   * das customer.subscription.deleted Webhook-Event sendet.
   */
  async cancelSubscription(
    stripeSubscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = this.getClientOrThrow();
    return stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  /**
   * Verifiziert und parst ein eingehendes Stripe-Webhook-Event
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = this.getClientOrThrow();
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe Webhook Secret ist nicht konfiguriert (STRIPE_WEBHOOK_SECRET fehlt)',
      );
    }
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
