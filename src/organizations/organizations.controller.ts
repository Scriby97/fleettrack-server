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
} from '@nestjs/common';
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
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly invitesService: OrganizationsInvitesService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN) // Nur Super-Admins können Organisationen erstellen
  create(@Body() createOrganizationDto: CreateOrganizationDto) {
    return this.organizationsService.create(createOrganizationDto);
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
   * Admins können nur für ihre eigene Org inviten, SUPER_ADMINs für beliebige Orgs (mit ?organizationId=xxx)
   */
  @Post('invites')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createInvite(
    @Body() createInviteDto: CreateInviteDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    // SUPER_ADMIN kann optional organizationId per Query Parameter angeben
    let targetOrgId: string;
    if (user.role === UserRole.SUPER_ADMIN && queryOrgId) {
      targetOrgId = queryOrgId;
    } else {
      // Normale Admins verwenden ihre eigene Organization
      if (!userOrgId) {
        throw new Error('You must belong to an organization to create invites');
      }
      targetOrgId = userOrgId;
    }

    return this.invitesService.createInvite(
      targetOrgId,
      createInviteDto,
      user.id,
    );
  }

  /**
   * GET /organizations/invites
   * Holt alle Invites der eigenen Organisation
   * SUPER_ADMINs können mit ?organizationId=xxx Invites beliebiger Orgs abrufen
   */
  @Get('invites')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getInvites(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() userOrgId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    // SUPER_ADMIN kann optional organizationId per Query Parameter angeben
    let targetOrgId: string;
    if (user.role === UserRole.SUPER_ADMIN && queryOrgId) {
      targetOrgId = queryOrgId;
    } else {
      // Normale Admins verwenden ihre eigene Organization
      if (!userOrgId) {
        throw new Error('You must belong to an organization to view invites');
      }
      targetOrgId = userOrgId;
    }

    return this.invitesService.getInvitesByOrganization(targetOrgId);
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
