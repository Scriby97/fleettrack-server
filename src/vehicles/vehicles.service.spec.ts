import { VehiclesService } from './vehicles.service';
import { AppNotFoundException } from '../common/exceptions';

/** A chainable TypeORM QueryBuilder stand-in: every method returns itself. */
function createQueryBuilderMock(terminalResults: Record<string, any> = {}) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getQueryAndParameters: jest.fn(
      () => terminalResults.queryAndParameters ?? ['SELECT 1', []],
    ),
    getRawMany: jest.fn(() => Promise.resolve(terminalResults.rawMany ?? [])),
  };
  return qb;
}

describe('VehiclesService', () => {
  let service: VehiclesService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve(data)),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const usageRepo = {
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VehiclesService(repo as any, usageRepo as any);
  });

  describe('findAll', () => {
    it('returns an empty array without querying when given an empty organizationIds array', async () => {
      const result = await service.findAll([]);

      expect(result).toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('filters by organization and excludes retired vehicles by default', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll(['org-a']);

      const call = repo.find.mock.calls[0][0];
      expect(call.where.isRetired).toBe(false);
      expect(call.where.organizationId).toBeDefined();
    });

    it('includes retired vehicles when includeRetired is true', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll(['org-a'], true);

      const call = repo.find.mock.calls[0][0];
      expect(call.where.isRetired).toBeUndefined();
    });

    it('does not filter by organization for a global administrator (organizationIds undefined)', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll(undefined);

      const call = repo.find.mock.calls[0][0];
      expect(call.where.organizationId).toBeUndefined();
    });
  });

  describe('countActive', () => {
    it('counts only non-retired vehicles of the organization', async () => {
      repo.count.mockResolvedValue(3);

      const result = await service.countActive('org-a');

      expect(result).toBe(3);
      expect(repo.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-a', isRetired: false },
      });
    });
  });

  describe('stats', () => {
    it('returns an empty array without querying when given an empty organizationIds array', async () => {
      const result = await service.stats([]);

      expect(result).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('converts raw aggregate rows to numbers and defaults missing values', async () => {
      const qb = createQueryBuilderMock({
        rawMany: [
          {
            id: 'v1',
            name: 'Pistenfahrzeug Nord',
            plate: 'BE 111',
            snowsatNumber: 'SLG_01',
            isRetired: false,
            location: null,
            vehicleType: 'Pistenfahrzeug',
            fuelType: 'Diesel',
            notes: null,
            organizationId: 'org-a',
            periodStartHours: '100.5',
            periodEndHours: '150.25',
            totalFuelLiters: '88.4',
          },
          {
            id: 'v2',
            name: 'Transporter',
            plate: 'BE 222',
            snowsatNumber: null,
            isRetired: null,
            location: null,
            vehicleType: null,
            fuelType: null,
            notes: null,
            organizationId: 'org-a',
            periodStartHours: null,
            periodEndHours: null,
            totalFuelLiters: null,
          },
        ],
      });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.stats(['org-a']);

      expect(result[0]).toMatchObject({
        id: 'v1',
        periodStartHours: 100.5,
        periodEndHours: 150.25,
        totalFuelLiters: 88.4,
      });
      // No usage in the period: null hours, isRetired defaults to false, fuel defaults to 0.
      expect(result[1]).toMatchObject({
        id: 'v2',
        isRetired: false,
        periodStartHours: null,
        periodEndHours: null,
        totalFuelLiters: 0,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'v.organizationId IN (:...organizationIds)',
        { organizationIds: ['org-a'] },
      );
    });

    it('does not scope the query to an organization for a global administrator', async () => {
      const qb = createQueryBuilderMock({ rawMany: [] });
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.stats(undefined);

      expect(qb.where).not.toHaveBeenCalled();
    });

    it('re-throws and logs when the query fails', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany = jest.fn(() => Promise.reject(new Error('db down')));
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.stats(['org-a'])).rejects.toThrow('db down');
    });
  });

  describe('usageHistory', () => {
    it('throws AppNotFoundException when the vehicle does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.usageHistory('missing-id')).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('aggregates daily rows into totals and reports first/last usage hours', async () => {
      const vehicle = { id: 'v1', name: 'Pistenfahrzeug Nord' };
      repo.findOne.mockResolvedValue(vehicle);
      const qb = createQueryBuilderMock({
        rawMany: [
          {
            date: '2025-01-01',
            operatingHours: '5',
            fuelLiters: '10',
            usageCount: '1',
          },
          {
            date: '2025-01-02',
            operatingHours: '3.5',
            fuelLiters: '0',
            usageCount: '1',
          },
        ],
      });
      usageRepo.createQueryBuilder.mockReturnValue(qb);
      usageRepo.findOne
        .mockResolvedValueOnce({ startOperatingHours: 100 }) // first usage
        .mockResolvedValueOnce({ endOperatingHours: 108.5 }); // last usage

      const result = await service.usageHistory('v1');

      expect(result.vehicle).toBe(vehicle);
      expect(result.totals).toEqual({
        operatingHours: 8.5,
        fuelLiters: 10,
        firstHours: 100,
        lastHours: 108.5,
        usageCount: 2,
      });
      expect(result.daily).toHaveLength(2);
    });

    it('returns null first/last hours and zeroed totals when there is no usage at all', async () => {
      repo.findOne.mockResolvedValue({ id: 'v1' });
      const qb = createQueryBuilderMock({ rawMany: [] });
      usageRepo.createQueryBuilder.mockReturnValue(qb);
      usageRepo.findOne.mockResolvedValue(null);

      const result = await service.usageHistory('v1');

      expect(result.totals).toEqual({
        operatingHours: 0,
        fuelLiters: 0,
        firstHours: null,
        lastHours: null,
        usageCount: 0,
      });
      expect(result.daily).toEqual([]);
    });

    it('applies the date range filter (andWhere) only when both dates are given', async () => {
      repo.findOne.mockResolvedValue({ id: 'v1' });
      const qb = createQueryBuilderMock({ rawMany: [] });
      usageRepo.createQueryBuilder.mockReturnValue(qb);
      usageRepo.findOne.mockResolvedValue(null);

      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');
      await service.usageHistory('v1', start, end);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'u.usageDate >= :startDate AND u.usageDate <= :endDate',
        { startDate: start, endDate: end },
      );
    });
  });

  describe('getLastOperatingHours', () => {
    it('returns the endOperatingHours of the most recent usage', async () => {
      usageRepo.findOne.mockResolvedValue({ endOperatingHours: 42.5 });

      await expect(service.getLastOperatingHours('v1')).resolves.toBe(42.5);
    });

    it('returns null when the vehicle has no usages', async () => {
      usageRepo.findOne.mockResolvedValue(null);

      await expect(service.getLastOperatingHours('v1')).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('throws AppNotFoundException for an unknown vehicle', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('merges the given fields into the existing vehicle and saves it', async () => {
      const vehicle = { id: 'v1', name: 'Old name', plate: 'BE 1' };
      repo.findOne.mockResolvedValue(vehicle);

      const result = await service.update('v1', { name: 'New name' });

      expect(result).toMatchObject({
        id: 'v1',
        name: 'New name',
        plate: 'BE 1',
      });
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws AppNotFoundException for an unknown vehicle', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('retires (does not delete) a vehicle that already has usages', async () => {
      const vehicle = { id: 'v1', isRetired: false };
      repo.findOne.mockResolvedValue(vehicle);
      usageRepo.count.mockResolvedValue(5);

      const result = await service.delete('v1');

      expect(result).toEqual(
        expect.objectContaining({ deleted: false, retired: true }),
      );
      expect(vehicle.isRetired).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(vehicle);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('permanently deletes a vehicle with no usages', async () => {
      const vehicle = { id: 'v1' };
      repo.findOne.mockResolvedValue(vehicle);
      usageRepo.count.mockResolvedValue(0);

      const result = await service.delete('v1');

      expect(result).toEqual(
        expect.objectContaining({ deleted: true, retired: false }),
      );
      expect(repo.remove).toHaveBeenCalledWith(vehicle);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
