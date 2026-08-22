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
   * Erstellt eine Stripe Checkout Session für ein Subscription-Upgrade.
   * Die Organisation bleibt bis zum erfolgreichen Checkout (Webhook) auf Lieutenant.
   */
  async createCheckoutSession(params: {
    organizationId: string;
    tier: SubscriptionTier;
    customerEmail?: string;
  }): Promise<string> {
    const stripe = this.getClientOrThrow();
    const priceId = this.getPriceIdForTier(params.tier);
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/+$/, '');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: params.organizationId,
      customer_email: params.customerEmail,
      metadata: {
        organizationId: params.organizationId,
        tier: params.tier,
      },
      success_url: `${frontendUrl}/onboarding/create-organization/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/onboarding/create-organization?canceled=1`,
    });

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
