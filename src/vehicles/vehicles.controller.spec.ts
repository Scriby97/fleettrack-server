import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import { UserRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  AppForbiddenException,
  AppBadRequestException,
} from '../common/exceptions';

describe('VehiclesController', () => {
  let controller: VehiclesController;

  const vehiclesService = {
    findAll: jest.fn(),
    stats: jest.fn(),
    findOne: jest.fn(),
    usageHistory: jest.fn(),
    getLastOperatingHours: jest.fn(),
  };
  const membersService = {
    getOrganizationIds: jest.fn(),
  };
  const subscriptionsService = {};

  const adminUser: AuthUser = { id: 'admin-1', role: UserRole.ADMINISTRATOR };
  const normalUser: AuthUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: OrganizationMembersService, useValue: membersService },
        {
          provide: OrganizationSubscriptionsService,
          useValue: subscriptionsService,
        },
      ],
    }).compile();

    controller = module.get<VehiclesController>(VehiclesController);
  });

  describe('getAll (organization scoping)', () => {
    it('does not filter by organization for a global administrator without a query param', async () => {
      vehiclesService.findAll.mockResolvedValue([]);

      await controller.getAll(adminUser);

      expect(vehiclesService.findAll).toHaveBeenCalledWith(undefined);
      expect(membersService.getOrganizationIds).not.toHaveBeenCalled();
    });

    it('scopes a normal user to their own organizations', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a', 'org-b']);
      vehiclesService.findAll.mockResolvedValue([]);

      await controller.getAll(normalUser);

      expect(vehiclesService.findAll).toHaveBeenCalledWith(['org-a', 'org-b']);
    });

    it('rejects a normal user requesting an organization they are not a member of', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);

      await expect(
        controller.getAll(normalUser, 'org-not-mine'),
      ).rejects.toThrow(AppForbiddenException);
    });
  });

  describe('getUsageHistory', () => {
    it('rejects a normal user for a vehicle outside their organization', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      vehiclesService.findOne.mockResolvedValue({
        id: 'v1',
        organizationId: 'org-b',
      });

      await expect(
        controller.getUsageHistory('v1', normalUser),
      ).rejects.toThrow(AppForbiddenException);
      expect(vehiclesService.usageHistory).not.toHaveBeenCalled();
    });

    it('allows a normal user for a vehicle inside their organization', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      vehiclesService.findOne.mockResolvedValue({
        id: 'v1',
        organizationId: 'org-a',
      });
      vehiclesService.usageHistory.mockResolvedValue({ totals: {}, daily: [] });

      await controller.getUsageHistory('v1', normalUser);

      expect(vehiclesService.usageHistory).toHaveBeenCalledWith(
        'v1',
        undefined,
        undefined,
      );
    });

    it('skips the organization check entirely for a global administrator', async () => {
      vehiclesService.usageHistory.mockResolvedValue({ totals: {}, daily: [] });

      await controller.getUsageHistory('v1', adminUser);

      expect(vehiclesService.findOne).not.toHaveBeenCalled();
      expect(membersService.getOrganizationIds).not.toHaveBeenCalled();
    });

    it('rejects startDate without endDate', async () => {
      await expect(
        controller.getUsageHistory(
          'v1',
          adminUser,
          '2025-01-01T00:00:00.000Z',
          undefined,
        ),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('rejects an unparsable date', async () => {
      await expect(
        controller.getUsageHistory('v1', adminUser, 'not-a-date', 'also-not'),
      ).rejects.toThrow(AppBadRequestException);
    });

    it('parses valid startDate/endDate and forwards them to the service', async () => {
      vehiclesService.usageHistory.mockResolvedValue({ totals: {}, daily: [] });

      await controller.getUsageHistory(
        'v1',
        adminUser,
        '2025-01-01T00:00:00.000Z',
        '2025-02-01T00:00:00.000Z',
      );

      expect(vehiclesService.usageHistory).toHaveBeenCalledWith(
        'v1',
        new Date('2025-01-01T00:00:00.000Z'),
        new Date('2025-02-01T00:00:00.000Z'),
      );
    });
  });
});
