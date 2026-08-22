import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

@Controller('invites')
export class InvitesController {
  private readonly logger = new Logger(InvitesController.name);

  constructor(
    private readonly invitesService: OrganizationsInvitesService,
    private readonly authService: AuthService,
  ) {}

  /**
   * GET /invites/:token
   * Validiert einen Invite-Token und gibt Info zur Organisation zurück
   * PUBLIC - Kein Login erforderlich
   */
  @Public()
  @Get(':token')
  async getInviteInfo(@Param('token') token: string) {
    const invite = await this.invitesService.validateInvite(token);

    return {
      email: invite.email,
      role: invite.role,
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
      },
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * POST /invites/accept
   * Akzeptiert einen Invite und erstellt einen neuen User
   * Erstellt auch eine organization_members Eintrag mit der Rolle aus dem Invite
   * PUBLIC - Kein Login erforderlich
   */
  @Public()
  @Post('accept')
  async acceptInvite(@Body() acceptInviteDto: AcceptInviteDto) {
    this.logger.log(`POST /invites/accept token=${acceptInviteDto.token.substring(0, 20)}...`);

    // Validiere Invite
    const invite = await this.invitesService.validateInvite(
      acceptInviteDto.token,
    );
    this.logger.log(`Invite validated for organization: ${invite.organization.name}`);

    // Prüfe ob die Email übereinstimmt
    if (invite.email.toLowerCase() !== acceptInviteDto.email.toLowerCase()) {
      this.logger.warn(`Email mismatch: Invite=${invite.email}, Request=${acceptInviteDto.email}`);
      throw new BadRequestException(
        'Email does not match the invited email address',
      );
    }

    // Erstelle User mit globaler "user" Rolle (nicht organization-spezifisch)
    this.logger.log(`Creating user via authService.signUp()...`);
    const result = await this.authService.signUp(
      acceptInviteDto.email,
      acceptInviteDto.password,
      {
        firstName: acceptInviteDto.firstName,
        lastName: acceptInviteDto.lastName,
      },
      UserRole.USER, // Neue User bekommen immer "user" Rolle, nie "administrator"
    );
    this.logger.log(`User created: ${result.user?.id}`);

    // Markiere Invite als verwendet
    if (result.user) {
      await this.invitesService.markInviteAsUsed(
        acceptInviteDto.token,
        result.user.id,
      );
      this.logger.log(`Invite marked as used`);

      // Erstelle organization_members Eintrag mit der Rolle aus dem Invite
      await this.invitesService.createMembership(
        result.user.id,
        invite.organizationId,
        invite.role,
      );
      this.logger.log(`Organization membership created with role: ${invite.role}`);
    } else {
      this.logger.error(`result.user is null/undefined - invite will NOT be marked as used`);
    }

    return {
      message: 'Successfully joined organization',
      user: result.user,
      session: result.session,
    };
  }
}
