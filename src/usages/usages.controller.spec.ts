import { Test, TestingModule } from '@nestjs/testing';
import { UsagesController } from './usages.controller';
import { UsagesService } from './usages.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CreateUsageDto } from './dto/create-usage.dto';
import type { UpdateUsageDto } from './dto/update-usage.dto';
import { encodeUsageCursor, MAX_USAGES_PAGE_SIZE } from './usage-cursor.util';
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions';

const emptyUpdate: UpdateUsageDto = {};

describe('UsagesController', () => {
  let controller: UsagesController;

  const usagesService = {
    findAllWithVehicles: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
    checkHoursContinuity: jest.fn(),
    findInconsistentPairs: jest.fn(),
  };
  const vehiclesService = {
    findOne: jest.fn(),
  };
  const membersService = {
    getOrganizationIds: jest.fn(),
    findMembership: jest.fn(),
  };

  const adminUser: AuthUser = { id: 'admin-1', role: UserRole.ADMINISTRATOR };
  const employee: AuthUser = { id: 'employee-1', role: UserRole.USER };
  const orgAdmin: AuthUser = { id: 'org-admin-1', role: UserRole.USER };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Standardmaessig keine Luecke/Ueberschneidung - Tests, die das explizit
    // pruefen wollen, ueberschreiben das gezielt mit ihrem eigenen mockResolvedValue.
    usagesService.checkHoursContinuity.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsagesController],
      providers: [
        { provide: UsagesService, useValue: usagesService },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: OrganizationMembersService, useValue: membersService },
      ],
    }).compile();

    controller = module.get<UsagesController>(UsagesController);
  });

  describe('getAll (creator filter)', () => {
    it('does not restrict a global administrator', async () => {
      usagesService.findAll.mockResolvedValue([]);

      await controller.getAll(adminUser);

      expect(usagesService.findAll).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('restricts an employee to their own usages', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.EMPLOYEE,
      });
      usagesService.findAll.mockResolvedValue([]);

      await controller.getAll(employee);

      expect(usagesService.findAll).toHaveBeenCalledWith(
        ['org-a'],
        employee.id,
        undefined,
        undefined,
      );
    });

    it('does not restrict an organization admin/owner', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.ADMIN,
      });
      usagesService.findAll.mockResolvedValue([]);

      await controller.getAll(orgAdmin);

      expect(usagesService.findAll).toHaveBeenCalledWith(
        ['org-a'],
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('getAll (date range)', () => {
    it('parses and forwards a valid startDate/endDate pair', async () => {
      usagesService.findAll.mockResolvedValue([]);

      await controller.getAll(
        adminUser,
        undefined,
        '2025-01-01T00:00:00.000Z',
        '2025-01-31T00:00:00.000Z',
      );

      expect(usagesService.findAll).toHaveBeenCalledWith(
        undefined,
        undefined,
        new Date('2025-01-01T00:00:00.000Z'),
        new Date('2025-01-31T00:00:00.000Z'),
      );
    });

    it('rejects startDate without endDate', async () => {
      await expect(
        controller.getAll(adminUser, undefined, '2025-01-01T00:00:00.000Z'),
      ).rejects.toThrow();
      expect(usagesService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('getAllWithVehicles (date range)', () => {
    it('parses and forwards a valid startDate/endDate pair', async () => {
      usagesService.findAllWithVehicles.mockResolvedValue({
        usages: [],
        nextCursor: null,
      });

      await controller.getAllWithVehicles(
        adminUser,
        undefined,
        '2025-01-01T00:00:00.000Z',
        '2025-01-31T00:00:00.000Z',
      );

      expect(usagesService.findAllWithVehicles).toHaveBeenCalledWith(
        undefined,
        undefined,
        new Date('2025-01-01T00:00:00.000Z'),
        new Date('2025-01-31T00:00:00.000Z'),
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('getAllWithVehicles (vehicleId filter)', () => {
    it('forwards vehicleId to the service', async () => {
      usagesService.findAllWithVehicles.mockResolvedValue({
        usages: [],
        nextCursor: null,
      });

      await controller.getAllWithVehicles(
        adminUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'vehicle-1',
      );

      expect(usagesService.findAllWithVehicles).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'vehicle-1',
      );
    });
  });

  describe('getAllWithVehicles (pagination)', () => {
    it('forwards the response of the service unchanged ({ usages, nextCursor })', async () => {
      const page = { usages: [{ id: 'u1' }], nextCursor: 'abc' };
      usagesService.findAllWithVehicles.mockResolvedValue(page);

      const result = await controller.getAllWithVehicles(adminUser);

      expect(result).toBe(page);
    });

    it('parses limit and decodes the cursor', async () => {
      usagesService.findAllWithVehicles.mockResolvedValue({
        usages: [],
        nextCursor: null,
      });
      const cursor = encodeUsageCursor({
        usageDate: new Date('2025-01-02T00:00:00.000Z'),
        id: 'u2',
      });

      await controller.getAllWithVehicles(
        adminUser,
        undefined,
        undefined,
        undefined,
        '10',
        cursor,
      );

      expect(usagesService.findAllWithVehicles).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        10,
        { usageDate: new Date('2025-01-02T00:00:00.000Z'), id: 'u2' },
        undefined,
      );
    });

    it('caps limit at the maximum page size', async () => {
      usagesService.findAllWithVehicles.mockResolvedValue({
        usages: [],
        nextCursor: null,
      });

      await controller.getAllWithVehicles(
        adminUser,
        undefined,
        undefined,
        undefined,
        '100000',
      );

      expect(usagesService.findAllWithVehicles).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        MAX_USAGES_PAGE_SIZE,
        undefined,
        undefined,
      );
    });

    it.each(['0', '-3', 'abc', '1.5'])(
      'rejects invalid limit %s',
      async (limit) => {
        await expect(
          controller.getAllWithVehicles(
            adminUser,
            undefined,
            undefined,
            undefined,
            limit,
          ),
        ).rejects.toThrow();
        expect(usagesService.findAllWithVehicles).not.toHaveBeenCalled();
      },
    );

    it('rejects a malformed cursor', async () => {
      await expect(
        controller.getAllWithVehicles(
          adminUser,
          undefined,
          undefined,
          undefined,
          '10',
          'not-a-cursor',
        ),
      ).rejects.toThrow();
      expect(usagesService.findAllWithVehicles).not.toHaveBeenCalled();
    });
  });

  describe('getInconsistentPairs', () => {
    it('rejects a request without vehicleId', async () => {
      await expect(
        controller.getInconsistentPairs(adminUser),
      ).rejects.toThrow();
      expect(usagesService.findInconsistentPairs).not.toHaveBeenCalled();
    });

    it('forwards vehicleId and the resolved organizationIds to the service', async () => {
      usagesService.findInconsistentPairs.mockResolvedValue([]);

      const result = await controller.getInconsistentPairs(adminUser, 'v1');

      expect(usagesService.findInconsistentPairs).toHaveBeenCalledWith(
        'v1',
        undefined,
      );
      expect(result).toEqual({ pairs: [] });
    });

    it('scopes a normal user to their own organizations', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      usagesService.findInconsistentPairs.mockResolvedValue([]);

      await controller.getInconsistentPairs(employee, 'v1');

      expect(usagesService.findInconsistentPairs).toHaveBeenCalledWith('v1', [
        'org-a',
      ]);
    });
  });

  describe('create', () => {
    it('rejects an employee creating a usage for a vehicle outside their organization', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      vehiclesService.findOne.mockResolvedValue({
        id: 'v1',
        organizationId: 'org-b',
      });

      const dto: CreateUsageDto = {
        vehicleId: 'v1',
        startOperatingHours: 1,
        fuelLitersRefilled: 0,
      };

      await expect(controller.create(dto, employee)).rejects.toThrow(
        AppForbiddenException,
      );
      expect(usagesService.create).not.toHaveBeenCalled();
    });

    it('allows creating a usage for a vehicle inside the own organization', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      vehiclesService.findOne.mockResolvedValue({
        id: 'v1',
        organizationId: 'org-a',
      });
      usagesService.create.mockResolvedValue({ id: 'usage-1' });
      const dto: CreateUsageDto = {
        vehicleId: 'v1',
        startOperatingHours: 1,
        endOperatingHours: 2,
        fuelLitersRefilled: 0,
        usageDate: new Date(),
      };

      await controller.create(dto, employee);

      expect(usagesService.create).toHaveBeenCalled();
    });
  });

  describe('create (hours continuity)', () => {
    const baseDto: CreateUsageDto = {
      vehicleId: 'v1',
      startOperatingHours: 10,
      endOperatingHours: 15,
      fuelLitersRefilled: 0,
      usageDate: new Date('2026-01-01T12:00:00.000Z'),
    };

    beforeEach(() => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      vehiclesService.findOne.mockResolvedValue({
        id: 'v1',
        organizationId: 'org-a',
      });
      usagesService.create.mockResolvedValue({ id: 'usage-1' });
    });

    it('blocks the save and throws AppConflictException when a gap/overlap is found', async () => {
      usagesService.checkHoursContinuity.mockResolvedValue([
        { type: 'gap', hours: 4.5 },
      ]);

      await expect(controller.create(baseDto, employee)).rejects.toThrow(
        AppConflictException,
      );
      expect(usagesService.create).not.toHaveBeenCalled();
    });

    it('saves anyway when confirmDespiteWarning is set, without re-checking', async () => {
      const dto: CreateUsageDto = { ...baseDto, confirmDespiteWarning: true };

      await controller.create(dto, employee);

      expect(usagesService.checkHoursContinuity).not.toHaveBeenCalled();
      expect(usagesService.create).toHaveBeenCalled();
    });

    it('saves normally when no gap/overlap is found', async () => {
      usagesService.checkHoursContinuity.mockResolvedValue([]);

      await controller.create(baseDto, employee);

      expect(usagesService.create).toHaveBeenCalled();
    });
  });

  describe('update (assertCanEditUsage)', () => {
    it('allows an employee to edit their own usage without a membership check', async () => {
      usagesService.findOne.mockResolvedValue({
        id: 'usage-1',
        creatorId: employee.id,
        vehicle: { organizationId: 'org-a' },
      });
      usagesService.update.mockResolvedValue({ id: 'usage-1' });

      await controller.update('usage-1', emptyUpdate, employee);

      expect(membersService.findMembership).not.toHaveBeenCalled();
      expect(usagesService.update).toHaveBeenCalled();
    });

    it("rejects an employee editing someone else's usage", async () => {
      usagesService.findOne.mockResolvedValue({
        id: 'usage-1',
        creatorId: 'someone-else',
        vehicle: { organizationId: 'org-a' },
      });
      membersService.findMembership.mockResolvedValue(null);

      await expect(
        controller.update('usage-1', emptyUpdate, employee),
      ).rejects.toThrow(AppForbiddenException);
    });

    it("allows an org admin to edit someone else's usage", async () => {
      usagesService.findOne.mockResolvedValue({
        id: 'usage-1',
        creatorId: 'someone-else',
        vehicle: { organizationId: 'org-a' },
      });
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.ADMIN,
      });
      usagesService.update.mockResolvedValue({ id: 'usage-1' });

      await controller.update('usage-1', emptyUpdate, orgAdmin);

      expect(usagesService.update).toHaveBeenCalled();
    });

    it('throws when the usage does not exist', async () => {
      usagesService.findOne.mockResolvedValue(null);

      await expect(
        controller.update('missing', emptyUpdate, employee),
      ).rejects.toThrow(AppNotFoundException);
    });
  });

  describe('update (hours continuity)', () => {
    beforeEach(() => {
      usagesService.findOne.mockResolvedValue({
        id: 'usage-1',
        creatorId: employee.id,
        vehicleId: 'v1',
        usageDate: new Date('2026-01-01T12:00:00.000Z'),
        startOperatingHours: 10,
        endOperatingHours: 15,
        vehicle: { organizationId: 'org-a' },
      });
      usagesService.update.mockResolvedValue({ id: 'usage-1' });
    });

    it('blocks the save and throws AppConflictException when a gap/overlap is found', async () => {
      usagesService.checkHoursContinuity.mockResolvedValue([
        { type: 'overlap', hours: 2 },
      ]);

      await expect(
        controller.update('usage-1', emptyUpdate, employee),
      ).rejects.toThrow(AppConflictException);
      expect(usagesService.update).not.toHaveBeenCalled();
    });

    it('saves anyway when confirmDespiteWarning is set, without re-checking', async () => {
      const dto: UpdateUsageDto = { confirmDespiteWarning: true };

      await controller.update('usage-1', dto, employee);

      expect(usagesService.checkHoursContinuity).not.toHaveBeenCalled();
      expect(usagesService.update).toHaveBeenCalled();
    });
  });

  describe('remove (assertCanManageUsage)', () => {
    it('rejects an employee, even for their own usage', async () => {
      usagesService.findOne.mockResolvedValue({
        id: 'usage-1',
        creatorId: employee.id,
        vehicle: { organizationId: 'org-a' },
      });
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.EMPLOYEE,
      });

      await expect(controller.remove('usage-1', employee)).rejects.toThrow(
        AppForbiddenException,
      );
      expect(usagesService.delete).not.toHaveBeenCalled();
    });

    it('allows an org admin to delete a usage', async () => {
      usagesService.findOne.mockResolvedValue({
        id: 'usage-1',
        creatorId: 'someone-else',
        vehicle: { organizationId: 'org-a' },
      });
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.ADMIN,
      });

      await controller.remove('usage-1', orgAdmin);

      expect(usagesService.delete).toHaveBeenCalledWith('usage-1');
    });

    it('always allows a global administrator', async () => {
      await controller.remove('usage-1', adminUser);

      expect(usagesService.findOne).not.toHaveBeenCalled();
      expect(usagesService.delete).toHaveBeenCalledWith('usage-1');
    });
  });
});
