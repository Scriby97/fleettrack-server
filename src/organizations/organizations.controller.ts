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
} from '@nestjs/common';
import type { Request } from 'express';
import { OrganizationsService } from './organizations.service';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';

@Controller('organizations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class OrganizationsController {
  private readonly logger = new Logger(OrganizationsController.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly invitesService: OrganizationsInvitesService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN) // Nur Super-Admins können Organisationen erstellen
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
  @Roles(UserRole.SUPER_ADMIN)
  findAll() {
    return this.organizationsService.findAll();
  }

  // ============================================
  // Invite Endpoints (MÜSSEN VOR /:id STEHEN!)
  // ============================================

  /**
   * POST /organizations/invites
   * Erstellt einen Invite-Link für die eigene Organization
    * Admins können nur für ihre eigene Org inviten, SUPER_ADMINs für beliebige Orgs
    * (mit ?organizationId=xxx oder organizationId im Body)
   */
  @Post('invites')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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

    // SUPER_ADMIN kann organizationId per Query oder Body angeben
    let targetOrgId: string;
    const superAdminTargetOrgId = queryOrgId || createInviteDto.organizationId;
    if (user.role === UserRole.SUPER_ADMIN && superAdminTargetOrgId) {
      targetOrgId = superAdminTargetOrgId;
    } else {
      // Normale Admins verwenden ihre eigene Organization
      if (!userOrgId) {
        throw new Error('You must belong to an organization to create invites');
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
    * SUPER_ADMINs erhalten standardmäßig alle Invites oder mit ?organizationId=xxx nur eine Org
   */
  @Get('invites')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getInvites(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    // SUPER_ADMIN: ohne Filter alle Invites, mit Filter nur eine Org
    if (user.role === UserRole.SUPER_ADMIN) {
      if (queryOrgId) {
        return this.invitesService.getInvitesByOrganization(queryOrgId);
      }

      return this.invitesService.getAllInvites();
    }

    // Normale Admins verwenden ihre eigene Organization
    if (!userOrgId) {
      throw new Error('You must belong to an organization to view invites');
    }

    return this.invitesService.getInvitesByOrganization(userOrgId);
  }

  /**
   * DELETE /organizations/invites/:inviteId
   * Löscht einen Invite
   */
  @Delete('invites/:inviteId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  deleteInvite(@Param('inviteId') inviteId: string) {
    return this.invitesService.deleteInvite(inviteId);
  }

  // ============================================
  // Organization CRUD (mit :id Parameter)
  // ============================================

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }
}
