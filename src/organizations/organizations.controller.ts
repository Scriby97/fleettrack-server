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
  Logger,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
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
  private readonly logger = new Logger(OrganizationsController.name);

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
   * Der User wird sofort Owner. Die Organisation startet immer auf Lieutenant (Free);
   * bei einem bezahlten Tier wird zusätzlich eine Stripe Checkout Session erstellt und
   * der Tier erst nach erfolgreicher Zahlung (Webhook) aktiviert.
   */
  @Post('self-service')
  async createSelfService(
    @Body() dto: CreateSelfServiceOrganizationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const { organization, subscription } =
      await this.organizationsService.createSelfService(dto, user.id);

    let checkoutUrl: string | null = null;
    if (
      dto.tier === SubscriptionTier.CAPTAIN ||
      dto.tier === SubscriptionTier.GENERAL
    ) {
      checkoutUrl = await this.stripeService.createCheckoutSession({
        organizationId: organization.id,
        tier: dto.tier,
        customerEmail: user.email,
      });
    }

    return { organization, subscription, checkoutUrl };
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
   * POST /organizations/invites
   * Erstellt einen Invite-Link für die eigene Organization
   * Administratoren können für beliebige Orgs inviten,
   * Normale User mit Org-Admin/Owner-Rolle nur für ihre eigene Org
   * (mit ?organizationId=xxx oder organizationId im Body)
   */
  @Post('invites')
  @Roles(UserRole.ADMINISTRATOR) // Nur Administratoren erlaubt, Org-Admins haben weitere Checks
  createInvite(
    @Req() req: Request,
    @Body() createInviteDto: CreateInviteDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    this.logger.log(
      `createInvite raw frontend params query=${JSON.stringify(req.query)} body=${JSON.stringify(req.body)}`,
    );
    this.logger.log(
      `createInvite validated dto email=${createInviteDto.email} role=${createInviteDto.role || 'none'} organizationId=${createInviteDto.organizationId || 'none'}`,
    );
    this.logger.log(
      `createInvite called by user=${user.id} role=${user.role} queryOrgId=${queryOrgId || 'none'} bodyOrgId=${createInviteDto.organizationId || 'none'} userOrgId=${userOrgId || 'none'}`,
    );

    // ADMINISTRATOR kann organizationId per Query oder Body angeben
    let targetOrgId: string;
    const adminTargetOrgId = queryOrgId || createInviteDto.organizationId;
    if (user.role === UserRole.ADMINISTRATOR && adminTargetOrgId) {
      targetOrgId = adminTargetOrgId;
    } else {
      // Normale Benutzer verwenden ihre eigene Organization
      if (!userOrgId) {
        throw new BadRequestException(
          'You must belong to an organization to create invites',
        );
      }
      targetOrgId = userOrgId;
    }

    this.logger.log(
      `createInvite resolved targetOrgId=${targetOrgId} email=${createInviteDto.email}`,
    );

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
   */
  @Get('invites')
  @Roles(UserRole.ADMINISTRATOR)
  getInvites(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    // ADMINISTRATOR: ohne Filter alle Invites, mit Filter nur eine Org
    if (user.role === UserRole.ADMINISTRATOR) {
      if (queryOrgId) {
        return this.invitesService.getInvitesByOrganization(queryOrgId);
      }

      return this.invitesService.getAllInvites();
    }

    // Normale Benutzer verwenden ihre eigene Organization
    if (!userOrgId) {
      throw new BadRequestException(
        'You must belong to an organization to view invites',
      );
    }

    return this.invitesService.getInvitesByOrganization(userOrgId);
  }

  /**
   * DELETE /organizations/invites/:inviteId
   * Löscht einen Invite
   */
  @Delete('invites/:inviteId')
  @Roles(UserRole.ADMINISTRATOR)
  deleteInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
  ) {
    return this.invitesService.deleteInvite(inviteId, user.role, userOrgId);
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
   */
  @Patch(':organizationId/subscription')
  @UseGuards(OrganizationGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  updateOrganizationSubscription(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.updateTier(organizationId, dto.tier);
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
