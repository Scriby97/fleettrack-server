import { Controller, Get, Post, Param } from '@nestjs/common';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: OrganizationsInvitesService) {}

  /**
   * GET /invites/mine
   * Alle offenen Einladungen für die Email-Adresse des eingeloggten Users
   * MUSS VOR /:token STEHEN!
   */
  @Get('mine')
  async getMyInvites(@CurrentUser() user: AuthUser) {
    const invites = await this.invitesService.getInvitesByEmail(user.email!);
    return invites.map((invite) => ({
      token: invite.token,
      role: invite.role,
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
      },
      expiresAt: invite.expiresAt,
    }));
  }

  /**
   * POST /invites/:token/accept
   * Akzeptiert eine Einladung als bereits eingeloggter, existierender User -
   * der eingeladene User meldet sich einfach in der App an und sieht seine
   * offenen Einladungen automatisch (siehe GET /invites/mine), ein separater
   * Registrierungs-per-Link-Flow ist nicht mehr noetig.
   */
  @Post(':token/accept')
  async acceptAsExistingUser(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.invitesService.acceptInviteForExistingUser(
      token,
      user.id,
      user.email!,
    );
    return { message: 'Erfolgreich der Organisation beigetreten' };
  }

  /**
   * POST /invites/:token/decline
   * Lehnt eine an den eingeloggten User gerichtete Einladung ab
   */
  @Post(':token/decline')
  async decline(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    await this.invitesService.declineInvite(token, user.email!);
    return { message: 'Einladung abgelehnt' };
  }
}
