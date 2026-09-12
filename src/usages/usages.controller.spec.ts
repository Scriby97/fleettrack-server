import { Test, TestingModule } from '@nestjs/testing';
import { UsagesController } from './usages.controller';
import { UsagesService } from './usages.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CreateUsageDto } from './dto/create-usage.dto';
import type { UpdateUsageDto } from './dto/update-usage.dto';
import {
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

      expect(usagesService.findAll).toHaveBeenCalledWith(undefined, undefined);
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
      );
    });

    it('does not restrict an organization admin/owner', async () => {
      membersService.getOrganizationIds.mockResolvedValue(['org-a']);
      membersService.findMembership.mockResolvedValue({
        role: OrganizationRole.ADMIN,
      });
      usagesService.findAll.mockResolvedValue([]);

      await controller.getAll(orgAdmin);

      expect(usagesService.findAll).toHaveBeenCalledWith(['org-a'], undefined);
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
