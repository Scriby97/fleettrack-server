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
   * PUBLIC - Kein Login erforderlich
   */
  @Public()
  @Post('accept')
  async acceptInvite(@Body() acceptInviteDto: AcceptInviteDto) {
    this.logger.log('🎯 POST /invites/accept wurde aufgerufen!');
    this.logger.log(`Token: ${acceptInviteDto.token.substring(0, 20)}...`);
    this.logger.log(`Email: ${acceptInviteDto.email}`);

    // Validiere Invite
    const invite = await this.invitesService.validateInvite(
      acceptInviteDto.token,
    );
    this.logger.log(`✅ Invite validiert für Organization: ${invite.organization.name}`);

    // Prüfe ob die Email übereinstimmt
    if (invite.email.toLowerCase() !== acceptInviteDto.email.toLowerCase()) {
      this.logger.error(`❌ Email mismatch: Invite=${invite.email}, Request=${acceptInviteDto.email}`);
      throw new BadRequestException(
        'Email does not match the invited email address',
      );
    }

    // Erstelle User mit der richtigen Organization
    this.logger.log(`🔨 Erstelle User mit authService.signUp()...`);
    const result = await this.authService.signUp(
      acceptInviteDto.email,
      acceptInviteDto.password,
      {
        firstName: acceptInviteDto.firstName,
        lastName: acceptInviteDto.lastName,
      },
      invite.role as any,
      invite.organizationId,
    );
    this.logger.log(`✅ User erstellt: ${result.user?.id}`);

    // Markiere Invite als verwendet
    if (result.user) {
      this.logger.log(`📝 Markiere Invite als verwendet...`);
      await this.invitesService.markInviteAsUsed(
        acceptInviteDto.token,
        result.user.id,
      );
      this.logger.log(`✅ Invite markiert als verwendet!`);
    } else {
      this.logger.error(`❌ result.user ist null/undefined - Invite wird NICHT markiert!`);
    }

    return {
      message: 'Successfully joined organization',
      user: result.user,
      session: result.session,
    };
  }
}
