import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from './stripe.service';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import { SubscriptionTier } from '../organizations/enums/subscription-tier.enum';
import { Public } from '../auth/decorators/public.decorator';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
  ) {}

  /**
   * POST /billing/webhook
   * Stripe Webhook - aktiviert den bezahlten Tier nach erfolgreichem Checkout
   * PUBLIC - Authentifizierung erfolgt über die Stripe-Signatur, nicht per Bearer Token
   */
  @Public()
  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Fehlende Stripe-Signatur');
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw Body nicht verfügbar');
    }

    const event = this.stripeService.constructEvent(rawBody, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const organizationId = session.client_reference_id;
      const tier = session.metadata?.tier as SubscriptionTier | undefined;
      const stripeCustomerId =
        typeof session.customer === 'string' ? session.customer : undefined;
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : undefined;

      if (!organizationId || !tier) {
        this.logger.warn(
          `checkout.session.completed ohne organizationId/tier: sessionId=${session.id}`,
        );
        return { received: true };
      }

      await this.subscriptionsService.activatePaidTier(
        organizationId,
        tier,
        stripeCustomerId ?? '',
        stripeSubscriptionId ?? '',
      );

      this.logger.log(
        `Subscription aktiviert: organizationId=${organizationId} tier=${tier}`,
      );
    }

    return { received: true };
  }
}
