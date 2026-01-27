import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UsageEntity } from './usage.entity';

@Injectable()
export class UsagesService {
  constructor(
    @InjectRepository(UsageEntity)
    private readonly repo: Repository<UsageEntity>,
  ) {}

  /**
   * Find all usages, optionally filtered by organizationId
   * Uses JOIN with vehicles table since usages don't have direct organizationId
   */
  async findAll(organizationId?: string): Promise<UsageEntity[]> {
    if (organizationId) {
      // Filter by organizationId through vehicles table
      return this.repo
        .createQueryBuilder('usage')
        .innerJoin('usage.vehicle', 'vehicle')
        .where('vehicle.organizationId = :organizationId', { organizationId })
        .getMany();
    }
    // Super Admin without organization filter sees all usages
    return this.repo.find();
  }

  /**
   * Find all usages with vehicle data included
   * Returns usages with nested vehicle information (id, name, plate)
   * @param organizationId - Filter by organization
   * @param creatorId - Filter by creator (for regular users)
   */
  async findAllWithVehicles(organizationId?: string, creatorId?: string): Promise<any[]> {
    const queryBuilder = this.repo
      .createQueryBuilder('usage')
      .innerJoinAndSelect('usage.vehicle', 'vehicle')
      .orderBy('usage.creationDate', 'DESC');

    if (organizationId) {
      queryBuilder.where('vehicle.organizationId = :organizationId', { organizationId });
    }

    // If creatorId is provided, filter by creator (for regular users)
    if (creatorId) {
      queryBuilder.andWhere('usage.creatorId = :creatorId', { creatorId });
    }

    const usages = await queryBuilder.getMany();

    // Transform to match expected response format
    return usages.map(usage => ({
      id: usage.id,
      vehicleId: usage.vehicleId,
      startOperatingHours: usage.startOperatingHours,
      endOperatingHours: usage.endOperatingHours,
      fuelLitersRefilled: usage.fuelLitersRefilled,
      creationDate: usage.creationDate,
      vehicle: {
        id: usage.vehicle.id,
        name: usage.vehicle.name,
        plate: usage.vehicle.plate,
      },
    }));
  }

  // Accept a DeepPartial<UsageEntity> so callers (controllers or other services)
  // can pass either a DTO or a partially-built entity.
  async create(data: DeepPartial<UsageEntity>): Promise<UsageEntity> {
    const toSave: DeepPartial<UsageEntity> = {
      ...data,
      startOperatingHours: data.startOperatingHours ?? 0,
      endOperatingHours: data.endOperatingHours,
      fuelLitersRefilled: (data.fuelLitersRefilled ?? 0) as any,
    };
    const saved = await this.repo.save(this.repo.create(toSave) as UsageEntity);
    return saved;
  }

  async update(id: string, data: DeepPartial<UsageEntity>): Promise<UsageEntity> {
    await this.repo.update(id, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Usage with id ${id} not found`);
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
