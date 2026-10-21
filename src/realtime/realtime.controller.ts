import { Controller, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { AppForbiddenException, ErrorCode } from '../common/exceptions';

@Controller('organizations')
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  /**
   * GET /organizations/:organizationId/events
   * Server-Sent-Events-Strom fuers Cache-Invalidieren im Frontend (siehe
   * DataFreshnessContext) - ein "changed"-Event, sobald sich Nutzungen oder
   * Fahrzeuge dieser Organisation aendern (RealtimeService.publish-Aufrufe in
   * UsagesController/VehiclesController). Kein Datentransport selbst, das
   * Frontend laedt die eigentlichen Daten danach ganz normal per REST nach.
   * Administratoren duerfen jede Organisation abonnieren, normale User nur
   * eigene Mitgliedschaften - derselbe Check wie bei den REST-Endpoints.
   */
  @Sse(':organizationId/events')
  async events(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Observable<MessageEvent>> {
    if (user.role !== UserRole.ADMINISTRATOR) {
      const organizationIds = await this.membersService.getOrganizationIds(
        user.id,
      );
      if (!organizationIds.includes(organizationId)) {
        throw new AppForbiddenException(
          ErrorCode.ORG_NOT_MEMBER_OF_TARGET,
          'Du bist kein Mitglied dieser Organisation',
        );
      }
    }

    return this.realtimeService.streamForOrganization(organizationId);
  }
}
