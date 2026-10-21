import { of } from 'rxjs';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { UserRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AppForbiddenException } from '../common/exceptions';

describe('RealtimeController', () => {
  let controller: RealtimeController;

  const realtimeService = {
    streamForOrganization: jest.fn(),
  };
  const membersService = {
    getOrganizationIds: jest.fn(),
  };

  const adminUser: AuthUser = { id: 'admin-1', role: UserRole.ADMINISTRATOR };
  const normalUser: AuthUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RealtimeController(
      realtimeService as unknown as RealtimeService,
      membersService as unknown as OrganizationMembersService,
    );
  });

  it('lets a global administrator subscribe to any organization without a membership check', async () => {
    const stream$ = of({ data: { type: 'changed' } } as MessageEvent);
    realtimeService.streamForOrganization.mockReturnValue(stream$);

    const result = await controller.events('org-a', adminUser);

    expect(membersService.getOrganizationIds).not.toHaveBeenCalled();
    expect(result).toBe(stream$);
  });

  it('lets a normal user subscribe to their own organization', async () => {
    membersService.getOrganizationIds.mockResolvedValue(['org-a']);
    const stream$ = of({ data: { type: 'changed' } } as MessageEvent);
    realtimeService.streamForOrganization.mockReturnValue(stream$);

    const result = await controller.events('org-a', normalUser);

    expect(result).toBe(stream$);
  });

  it('rejects a normal user subscribing to an organization they are not a member of', async () => {
    membersService.getOrganizationIds.mockResolvedValue(['org-a']);

    await expect(controller.events('org-not-mine', normalUser)).rejects.toThrow(
      AppForbiddenException,
    );
    expect(realtimeService.streamForOrganization).not.toHaveBeenCalled();
  });
});
