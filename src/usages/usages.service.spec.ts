import { UsagesService } from './usages.service';
import { AppNotFoundException } from '../common/exceptions';

function createQueryBuilderMock(getManyResult: any[] = []) {
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    innerJoinAndSelect: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
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
      expect(qb.where).toHaveBeenCalledWith(
        'vehicle.organizationId IN (:...organizationIds)',
        { organizationIds: ['org-a'] },
      );
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('additionally restricts to the creator when creatorId is given', async () => {
      const qb = createQueryBuilderMock([]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(['org-a'], 'user-1');

      expect(qb.andWhere).toHaveBeenCalledWith('usage.creatorId = :creatorId', {
        creatorId: 'user-1',
      });
    });
  });

  describe('findAllWithVehicles', () => {
    it('returns an empty array without querying when given an empty organizationIds array', async () => {
      const result = await service.findAllWithVehicles([]);

      expect(result).toEqual([]);
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

      expect(result).toEqual([
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
