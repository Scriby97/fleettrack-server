import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationSubscriptionsService } from './organization-subscriptions.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateSelfServiceOrganizationDto } from './dto/create-self-service-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SUBSCRIPTION_LIMITS } from './constants/subscription-limits.constant';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { SubscriptionTier } from './enums/subscription-tier.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrganizationGuard } from '../auth/guards/organization.guard';
import { OrganizationRolesGuard } from '../auth/guards/organization-roles.guard';
import { OrganizationRoles } from '../auth/decorators/organization-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { StripeService } from '../billing/stripe.service';

@Controller('organizations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly invitesService: OrganizationsInvitesService,
    private readonly membersService: OrganizationMembersService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * POST /organizations/self-service
   * Erstellt eine Organisation für den aktuellen User (jeder eingeloggte User darf das).
   * Der User wird sofort Owner.
   *
   * Lieutenant (kostenlos): Organisation wird sofort angelegt, keine Zahlung nötig.
   * Captain/General (bezahlt): Es wird NUR eine Stripe Checkout Session erstellt -
   * die Organisation selbst entsteht erst im checkout.session.completed Webhook,
   * sobald die Zahlung bestätigt ist. So bleibt bei Abbruch/Fehlschlag der Zahlung
   * keine unvollständige Organisation in der DB zurück.
   */
  @Post('self-service')
  async createSelfService(
    @Body() dto: CreateSelfServiceOrganizationDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (
      dto.tier === SubscriptionTier.CAPTAIN ||
      dto.tier === SubscriptionTier.GENERAL
    ) {
      // Vorab-Check, damit der User nicht erst bezahlt und danach an einer
      // Namens-Kollision scheitert (schließt die seltene Race Condition zwischen
      // diesem Check und Zahlungsabschluss nicht aus, siehe createFromStripeCheckout).
      await this.organizationsService.assertNameAvailable(dto.name);

      const checkoutUrl =
        await this.stripeService.createCheckoutSessionForNewOrganization({
          name: dto.name,
          subdomain: dto.subdomain,
          contactEmail: dto.contactEmail,
          ownerUserId: user.id,
          tier: dto.tier,
          customerEmail: user.email,
        });

      return { organization: null, subscription: null, checkoutUrl };
    }

    const { organization, subscription } =
      await this.organizationsService.createSelfService(dto, user.id);

    return { organization, subscription, checkoutUrl: null };
  }

  @Post()
  @Roles(UserRole.ADMINISTRATOR) // Nur Administratoren können Organisationen erstellen
  async create(@Body() createOrganizationDto: CreateOrganizationDto) {
    const result = await this.organizationsService.create(
      createOrganizationDto,
    );

    // Generiere Invite-Link
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/accept?token=${result.inviteToken}`;

    return {
      organization: result.organization,
      invite: {
        token: result.inviteToken,
        link: inviteLink,
        email: createOrganizationDto.adminEmail,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 Tage
      },
    };
  }

  @Get()
  @Roles(UserRole.ADMINISTRATOR)
  findAll() {
    return this.organizationsService.findAll();
  }

  // ============================================
  // Invite Endpoints (MÜSSEN VOR /:id STEHEN!)
  // ============================================

  /**
   * Ermittelt die Organisation, für die ein normaler User Invites verwalten darf
   * (Admin oder Owner in genau dieser Organisation - Owner hat automatisch auch
   * alle Admin-Rechte). Administratoren dürfen jede Organisation angeben.
   */
  private async resolveManageableOrganizationId(
    user: AuthUser,
    requestedOrgId?: string,
  ): Promise<string> {
    if (user.role === UserRole.ADMINISTRATOR) {
      if (!requestedOrgId) {
        throw new BadRequestException('Organization ID is required');
      }
      return requestedOrgId;
    }

    const managedOrgIds = await this.membersService.getManagedOrganizationIds(
      user.id,
    );

    if (requestedOrgId) {
      if (!managedOrgIds.includes(requestedOrgId)) {
        throw new ForbiddenException(
          'Du bist nicht Admin oder Owner dieser Organisation',
        );
      }
      return requestedOrgId;
    }

    if (managedOrgIds.length === 1) {
      return managedOrgIds[0];
    }
    if (managedOrgIds.length === 0) {
      throw new ForbiddenException(
        'Nur Organisations-Admins oder -Owner dürfen Einladungen verwalten',
      );
    }
    throw new BadRequestException(
      'Bitte organizationId angeben - du verwaltest mehrere Organisationen',
    );
  }

  /**
   * Stellt sicher, dass das maxMembers-Limit des aktuellen Tarifs noch nicht
   * erreicht ist (null = unlimitiert). Zählt bestehende Mitglieder UND bereits
   * offene Invites zusammen, damit nicht mehr Plätze verschickt werden können
   * als der Tarif zulässt.
   */
  private async assertMemberLimitNotExceeded(
    organizationId: string,
  ): Promise<void> {
    const limits = await this.subscriptionsService.getLimits(organizationId);
    if (limits.maxMembers === null) {
      return;
    }

    const [memberCount, pendingInviteCount] = await Promise.all([
      this.membersService.countByOrganization(organizationId),
      this.invitesService.countPendingByOrganization(organizationId),
    ]);
    if (memberCount + pendingInviteCount >= limits.maxMembers) {
      throw new ForbiddenException(
        `Das Mitglieder-Limit von ${limits.maxMembers} für den aktuellen Tarif ist erreicht. Bitte upgraden Sie das Abonnement, um weitere Mitarbeiter einzuladen.`,
      );
    }
  }

  /**
   * POST /organizations/invites
   * Erstellt einen Invite-Link für die eigene Organization
   * Administratoren können für beliebige Orgs inviten,
   * Normale User mit Org-Admin/Owner-Rolle nur für ihre eigene Org
   * (mit ?organizationId=xxx oder organizationId im Body)
   */
  @Post('invites')
  async createInvite(
    @Body() createInviteDto: CreateInviteDto,
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const targetOrgId = await this.resolveManageableOrganizationId(
      user,
      queryOrgId || createInviteDto.organizationId,
    );
    await this.assertMemberLimitNotExceeded(targetOrgId);

    return this.invitesService.createInvite(
      targetOrgId,
      createInviteDto,
      user.id,
    );
  }

  /**
   * GET /organizations/invites
   * Holt alle Invites der eigenen Organisation
   * Administratoren erhalten standardmäßig alle Invites oder mit ?organizationId=xxx nur eine Org
   * Normale User sehen die Invites ihrer eigenen Organisation(en) (jede Org-Rolle)
   */
  @Get('invites')
  async getInvites(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    if (user.role === UserRole.ADMINISTRATOR) {
      if (queryOrgId) {
        return this.invitesService.getInvitesByOrganization(queryOrgId);
      }
      return this.invitesService.getAllInvites();
    }

    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );
    const targetOrgId = queryOrgId || organizationIds[0];

    if (!targetOrgId || !organizationIds.includes(targetOrgId)) {
      throw new ForbiddenException('Du bist kein Mitglied dieser Organisation');
    }

    return this.invitesService.getInvitesByOrganization(targetOrgId);
  }

  /**
   * DELETE /organizations/invites/:inviteId
   * Löscht einen Invite
   * Administratoren beliebig, normale User nur als Admin/Owner ihrer eigenen Organisation(en)
   */
  @Delete('invites/:inviteId')
  async deleteInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const managedOrgIds =
      user.role === UserRole.ADMINISTRATOR
        ? undefined
        : await this.membersService.getManagedOrganizationIds(user.id);

    return this.invitesService.deleteInvite(inviteId, user.role, managedOrgIds);
  }

  // ============================================
  // "Meine Organisationen" (MUSS VOR /:id STEHEN!)
  // ============================================

  /**
   * GET /organizations/mine
   * Alle Organisationen, in denen der aktuelle User Mitglied ist (inkl. Rolle + Org-Name)
   * Für Org-Switcher im Frontend
   */
  @Get('mine')
  getMyOrganizations(@CurrentUser() user: AuthUser) {
    return this.membersService.findByUser(user.id);
  }

  // ============================================
  // Members Endpoints (MÜSSEN VOR /:id STEHEN!)
  // ============================================

  /**
   * GET /organizations/:organizationId/members
   * Alle Mitglieder einer Organisation
   * Administratoren oder Mitglieder der Organisation (jede Rolle)
   */
  @Get(':organizationId/members')
  @UseGuards(OrganizationGuard)
  getOrganizationMembers(@Param('organizationId') organizationId: string) {
    return this.membersService.findByOrganization(organizationId);
  }

  /**
   * PATCH /organizations/:organizationId/members/:memberId
   * Rolle eines Mitglieds ändern
   * Nur Administratoren oder Org-Admins/Owner
   */
  @Patch(':organizationId/members/:memberId')
  @UseGuards(OrganizationGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.ADMIN)
  updateOrganizationMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateRole(organizationId, memberId, dto.role);
  }

  /**
   * DELETE /organizations/:organizationId/members/:memberId
   * Mitglied aus der Organisation entfernen
   * Nur Administratoren oder Org-Admins/Owner
   */
  @Delete(':organizationId/members/:memberId')
  @UseGuards(OrganizationGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.ADMIN)
  async removeOrganizationMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.membersService.remove(organizationId, memberId);
    return { message: 'Mitglied entfernt', id: memberId };
  }

  // ============================================
  // Subscription Endpoints (MÜSSEN VOR /:id STEHEN!)
  // ============================================

  /**
   * GET /organizations/:organizationId/subscription
   * Aktuelle Subscription der Organisation inkl. Plan-Limits
   * Administratoren oder Mitglieder der Organisation (jede Rolle)
   */
  @Get(':organizationId/subscription')
  @UseGuards(OrganizationGuard)
  async getOrganizationSubscription(
    @Param('organizationId') organizationId: string,
  ) {
    const subscription =
      await this.subscriptionsService.findByOrganization(organizationId);
    return {
      ...subscription,
      limits: SUBSCRIPTION_LIMITS[subscription.tier],
    };
  }

  /**
   * PATCH /organizations/:organizationId/subscription
   * Subscription-Tier ändern
   * Nur Administratoren oder der Org-Owner
   *
   * WICHTIG: setzt tier/status NICHT mehr direkt in der DB - das hätte einem
   * Owner erlaubt, sich per PATCH kostenlos auf Captain/General hochzustufen,
   * ganz ohne Stripe/Zahlung. Stattdessen:
   * - Lieutenant -> Captain/General: liefert eine neue Stripe Checkout Session
   * - Captain <-> General: wechselt die bestehende Stripe Subscription direkt
   *   (mit Proration), DB wird danach synchron gehalten
   * - * -> Lieutenant: kündigt die Stripe Subscription zum Periodenende; der
   *   eigentliche Downgrade in der DB passiert erst über das
   *   customer.subscription.deleted Webhook
   */
  @Patch(':organizationId/subscription')
  @UseGuards(OrganizationGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  async updateOrganizationSubscription(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const current =
      await this.subscriptionsService.findByOrganization(organizationId);

    if (dto.tier === current.tier) {
      return current;
    }

    // Kündigung / Downgrade auf Free
    if (dto.tier === SubscriptionTier.LIEUTENANT) {
      if (current.stripeSubscriptionId) {
        await this.stripeService.cancelSubscription(
          current.stripeSubscriptionId,
        );
      }
      return current; // Tier bleibt bis zum Periodenende aktiv, siehe Webhook
    }

    // Upgrade von Free: es existiert noch kein Stripe-Customer/-Subscription
    if (current.tier === SubscriptionTier.LIEUTENANT) {
      const checkoutUrl = await this.stripeService.createCheckoutSession({
        organizationId,
        tier: dto.tier,
        customerEmail: user.email,
      });
      return { ...current, checkoutUrl };
    }

    // Wechsel zwischen bezahlten Tiers (Captain <-> General): direkt auf der
    // bestehenden Stripe Subscription umstellen, inkl. Proration.
    if (!current.stripeSubscriptionId) {
      throw new BadRequestException(
        'Keine aktive Stripe Subscription für diese Organisation gefunden',
      );
    }
    await this.stripeService.changeSubscriptionTier({
      stripeSubscriptionId: current.stripeSubscriptionId,
      newTier: dto.tier,
    });
    return this.subscriptionsService.updateTier(organizationId, dto.tier);
  }

  /**
   * POST /organizations/:organizationId/billing-portal
   * Erstellt eine Stripe Customer Portal Session (Rechnungen/Invoicing,
   * Zahlungsmethode, Kündigung) - Self-Service ohne Support-Ticket.
   * Nur Administratoren oder der Org-Owner.
   */
  @Post(':organizationId/billing-portal')
  @UseGuards(OrganizationGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  async createBillingPortalSession(
    @Param('organizationId') organizationId: string,
  ) {
    const subscription =
      await this.subscriptionsService.findByOrganization(organizationId);
    if (!subscription.stripeCustomerId) {
      throw new BadRequestException(
        'Diese Organisation hat noch keinen Stripe-Customer (Lieutenant/Free Tier)',
      );
    }
    const url = await this.stripeService.createPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
    });
    return { url };
  }

  // ============================================
  // Organization CRUD (mit :id Parameter)
  // ============================================

  @Get(':id')
  @Roles(UserRole.ADMINISTRATOR)
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
  ) {
    if (user.role !== UserRole.ADMINISTRATOR && id !== userOrgId) {
      throw new ForbiddenException('You can only view your own organization');
    }
    return this.organizationsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMINISTRATOR)
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMINISTRATOR)
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }
}
