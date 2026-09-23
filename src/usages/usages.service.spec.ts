import { UsagesService } from './usages.service';
import { AppNotFoundException } from '../common/exceptions';
import { decodeUsageCursor } from './usage-cursor.util';

function createQueryBuilderMock(getManyResult: any[] = []) {
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    innerJoinAndSelect: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getMany: jest.fn(() => Promise.resolve(getManyResult)),
  };
  return qb;
}

describe('UsagesService', () => {
  let service: UsagesService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve(data)),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsagesService(repo as any);
  });

  describe('findAll', () => {
    it('returns an empty array without querying when given an empty organizationIds array', async () => {
      const result = await service.findAll([]);

      expect(result).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('returns everything unfiltered for a global administrator (no orgIds, no creatorId)', async () => {
      repo.find.mockResolvedValue([{ id: 'u1' }]);

      const result = await service.findAll();

      expect(result).toEqual([{ id: 'u1' }]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('scopes by organization via a join when organizationIds are given', async () => {
      const qb = createQueryBuilderMock([{ id: 'u1' }]);
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(['org-a']);

      expect(result).toEqual([{ id: 'u1' }]);
      expect(qb.where).toHaveBeenCalledWith('vehicle.archivedAt IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith(
        'vehicle.organizationId IN (:...organizationIds)',
        { organizationIds: ['org-a'] },
      );
    });

    it('additionally restricts to the creator when creatorId is given', async () => {
      const qb = createQueryBuilderMock([]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(['org-a'], 'user-1');

      expect(qb.andWhere).toHaveBeenCalledWith('usage.creatorId = :creatorId', {
        creatorId: 'user-1',
      });
    });

    it('restricts to a date range via the query builder when both startDate and endDate are given', async () => {
      const qb = createQueryBuilderMock([]);
      repo.createQueryBuilder.mockReturnValue(qb);
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await service.findAll(undefined, undefined, startDate, endDate);

      expect(repo.createQueryBuilder).toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'usage.usageDate >= :startDate AND usage.usageDate <= :endDate',
        { startDate, endDate },
      );
    });

    it('ignores a one-sided date range (falls back to the unfiltered admin path)', async () => {
      repo.find.mockResolvedValue([{ id: 'u1' }]);

      const result = await service.findAll(undefined, undefined, new Date());

      expect(result).toEqual([{ id: 'u1' }]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findAllWithVehicles', () => {
    it('returns an empty array without querying when given an empty organizationIds array', async () => {
      const result = await service.findAllWithVehicles([]);

      expect(result).toEqual({ usages: [], nextCursor: null });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('maps each usage to the flattened response shape with nested vehicle/creator', async () => {
      const qb = createQueryBuilderMock([
        {
          id: 'u1',
          vehicleId: 'v1',
          creatorId: 'c1',
          startOperatingHours: 10,
          endOperatingHours: 12,
          fuelLitersRefilled: 5,
          creationDate: 123,
          usageDate: new Date('2025-01-01'),
          vehicle: {
            id: 'v1',
            name: 'Pistenfahrzeug',
            plate: 'BE 1',
            vehicleType: 'Pistenfahrzeug',
          },
          creator: {
            id: 'c1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
          },
        },
      ]);
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAllWithVehicles();

      expect(result.nextCursor).toBeNull();
      expect(result.usages).toEqual([
        {
          id: 'u1',
          vehicleId: 'v1',
          creatorId: 'c1',
          startOperatingHours: 10,
          endOperatingHours: 12,
          fuelLitersRefilled: 5,
          creationDate: 123,
          usageDate: new Date('2025-01-01'),
          vehicle: {
            id: 'v1',
            name: 'Pistenfahrzeug',
            plate: 'BE 1',
            vehicleType: 'Pistenfahrzeug',
          },
          creator: {
            id: 'c1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
          },
        },
      ]);
    });

    it('restricts to a date range via the query builder when both startDate and endDate are given', async () => {
      const qb = createQueryBuilderMock([]);
      repo.createQueryBuilder.mockReturnValue(qb);
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await service.findAllWithVehicles(
        undefined,
        undefined,
        startDate,
        endDate,
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        'usage.usageDate >= :startDate AND usage.usageDate <= :endDate',
        { startDate, endDate },
      );
    });

    it('restricts to a single vehicle when vehicleId is given', async () => {
      const qb = createQueryBuilderMock([]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findAllWithVehicles(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'v1',
      );

      expect(qb.andWhere).toHaveBeenCalledWith('usage.vehicleId = :vehicleId', {
        vehicleId: 'v1',
      });
    });

    describe('pagination', () => {
      const makeUsage = (id: string, usageDate: string) => ({
        id,
        vehicleId: 'v1',
        creatorId: 'c1',
        startOperatingHours: 1,
        endOperatingHours: 2,
        fuelLitersRefilled: 0,
        creationDate: 1,
        usageDate: new Date(usageDate),
        vehicle: { id: 'v1', name: 'V', plate: 'P', vehicleType: 'T' },
        creator: { id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.c' },
      });

      it('orders newest first with id as tiebreaker', async () => {
        const qb = createQueryBuilderMock([]);
        repo.createQueryBuilder.mockReturnValue(qb);

        await service.findAllWithVehicles(['org-a']);

        expect(qb.orderBy).toHaveBeenCalledWith('usage.usageDate', 'DESC');
        expect(qb.addOrderBy).toHaveBeenCalledWith('usage.id', 'DESC');
      });

      it('does not limit and returns no cursor when no limit is given', async () => {
        const qb = createQueryBuilderMock([
          makeUsage('u1', '2025-01-02'),
          makeUsage('u2', '2025-01-01'),
        ]);
        repo.createQueryBuilder.mockReturnValue(qb);

        const result = await service.findAllWithVehicles(['org-a']);

        expect(qb.limit).not.toHaveBeenCalled();
        expect(result.usages).toHaveLength(2);
        expect(result.nextCursor).toBeNull();
      });

      it('fetches limit+1 rows and returns a cursor for the last returned row when more exist', async () => {
        const qb = createQueryBuilderMock([
          makeUsage('u3', '2025-01-03'),
          makeUsage('u2', '2025-01-02'),
          makeUsage('u1', '2025-01-01'),
        ]);
        repo.createQueryBuilder.mockReturnValue(qb);

        const result = await service.findAllWithVehicles(
          ['org-a'],
          undefined,
          undefined,
          undefined,
          2,
        );

        expect(qb.limit).toHaveBeenCalledWith(3);
        expect(result.usages.map((u) => u.id)).toEqual(['u3', 'u2']);
        expect(decodeUsageCursor(result.nextCursor as string)).toEqual({
          usageDate: new Date('2025-01-02'),
          id: 'u2',
        });
      });

      it('returns no cursor on the last page', async () => {
        const qb = createQueryBuilderMock([
          makeUsage('u2', '2025-01-02'),
          makeUsage('u1', '2025-01-01'),
        ]);
        repo.createQueryBuilder.mockReturnValue(qb);

        const result = await service.findAllWithVehicles(
          ['org-a'],
          undefined,
          undefined,
          undefined,
          2,
        );

        expect(result.usages).toHaveLength(2);
        expect(result.nextCursor).toBeNull();
      });

      it('continues after the given cursor via a keyset comparison', async () => {
        const qb = createQueryBuilderMock([]);
        repo.createQueryBuilder.mockReturnValue(qb);
        const cursor = { usageDate: new Date('2025-01-02'), id: 'u2' };

        await service.findAllWithVehicles(
          ['org-a'],
          undefined,
          undefined,
          undefined,
          10,
          cursor,
        );

        expect(qb.andWhere).toHaveBeenCalledWith(
          '(usage.usageDate, usage.id) < (:cursorDate, CAST(:cursorId AS uuid))',
          { cursorDate: cursor.usageDate, cursorId: 'u2' },
        );
      });
    });
  });

  describe('create', () => {
    it('defaults startOperatingHours and fuelLitersRefilled to 0 when not given', async () => {
      await service.create({ vehicleId: 'v1' });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          startOperatingHours: 0,
          fuelLitersRefilled: 0,
        }),
      );
    });

    it('keeps explicitly given values instead of overwriting them with defaults', async () => {
      await service.create({
        vehicleId: 'v1',
        startOperatingHours: 10,
        endOperatingHours: 12,
        fuelLitersRefilled: 5,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          startOperatingHours: 10,
          endOperatingHours: 12,
          fuelLitersRefilled: 5,
        }),
      );
    });
  });

  describe('update', () => {
    it('throws AppNotFoundException when the usage no longer exists after the update', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', {})).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('persists the update and returns the refreshed usage', async () => {
      repo.findOne.mockResolvedValue({ id: 'u1', fuelLitersRefilled: 8 });

      const result = await service.update('u1', { fuelLitersRefilled: 8 });

      expect(repo.update).toHaveBeenCalledWith('u1', { fuelLitersRefilled: 8 });
      expect(result).toEqual({ id: 'u1', fuelLitersRefilled: 8 });
    });
  });

  describe('delete', () => {
    it('delegates to the repository', async () => {
      await service.delete('u1');

      expect(repo.delete).toHaveBeenCalledWith('u1');
    });
  });
});
