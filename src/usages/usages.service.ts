import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UsageEntity } from './usage.entity';
import { IdempotencyKeyEntity } from '../idempotency/idempotency.entity';
import { ConflictException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class UsagesService {
  constructor(
    @InjectRepository(UsageEntity)
    private readonly repo: Repository<UsageEntity>,
    @InjectRepository(IdempotencyKeyEntity)
    private readonly idempotencyRepo: Repository<IdempotencyKeyEntity>,
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
      .innerJoinAndSelect('usage.creator', 'creator')
      .orderBy('usage."creationDate"', 'DESC');

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
      creatorId: usage.creatorId,
      startOperatingHours: usage.startOperatingHours,
      endOperatingHours: usage.endOperatingHours,
      fuelLitersRefilled: usage.fuelLitersRefilled,
      creationDate: usage.creationDate,
      usageDate: usage.usageDate,
      vehicle: {
        id: usage.vehicle.id,
        name: usage.vehicle.name,
        plate: usage.vehicle.plate,
      },
      creator: {
        id: usage.creator.id,
        firstName: usage.creator.firstName,
        lastName: usage.creator.lastName,
      },
    }));
  }

  // Accept a DeepPartial<UsageEntity> so callers (controllers or other services)
  // can pass either a DTO or a partially-built entity.
  /**
   * Create usage with optional idempotency key and owner check.
   * If idempotencyKey is provided and exists for the same user, return existing resource.
   */
  async create(
    data: DeepPartial<UsageEntity>,
    idempotencyKey?: string,
    userId?: string,
  ): Promise<UsageEntity> {
    const toSave: DeepPartial<UsageEntity> = {
      ...data,
      startOperatingHours: data.startOperatingHours ?? 0,
      endOperatingHours: data.endOperatingHours,
      fuelLitersRefilled: (data.fuelLitersRefilled ?? 0) as any,
      updatedAt: Date.now(),
      version: 1,
      deleted: false,
    };

    if (idempotencyKey) {
      const existing = await this.idempotencyRepo.findOne({ where: { key: idempotencyKey } });
      if (existing) {
        // Prevent cross-user replay
        if (userId && existing.userId !== userId) {
          throw new ForbiddenException('Idempotency key belongs to another user');
        }
        const existingResource = await this.repo.findOne({ where: { id: existing.resourceId } });
        if (existingResource) return existingResource;
      }
    }

    const saved = await this.repo.save(this.repo.create(toSave) as UsageEntity);

    if (idempotencyKey) {
      await this.idempotencyRepo.save(
        this.idempotencyRepo.create({
          key: idempotencyKey,
          resourceId: saved.id,
          userId: userId,
          createdAt: Date.now(),
          expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24h default
          method: 'POST',
          route: '/usages',
        }),
      );
    }

    return saved;
  }

  /**
   * Update with optimistic concurrency control via version.
   * expectedVersion: optional number from If-Match header.
   */
  async update(
    id: string,
    data: DeepPartial<UsageEntity>,
    expectedVersion?: number,
  ): Promise<UsageEntity> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Usage with id ${id} not found`);

    if (typeof expectedVersion === 'number' && existing.version !== expectedVersion) {
      // Return conflict with server resource
      throw new ConflictException({ server: existing, version: existing.version, conflictReason: 'version_mismatch' });
    }

    const nextVersion = (existing.version || 0) + 1;
    const updatePayload: any = { ...data, version: nextVersion, updatedAt: Date.now() };
    await this.repo.update(id, updatePayload);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new Error(`Usage with id ${id} not found after update`);
    return updated;
  }

  /** Soft delete: mark deleted=true and set deletedAt, bump version/updatedAt */
  async delete(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) return;
    const nextVersion = (existing.version || 0) + 1;
    await this.repo.update(id, { deleted: true, deletedAt: Date.now(), updatedAt: Date.now(), version: nextVersion });
  }

  /** Find changes since a given timestamp (ms). Returns creates/updates/deletes as unified list. */
  async findChangesSince(sinceMs: number): Promise<UsageEntity[]> {
    return this.repo
      .createQueryBuilder('usage')
      // use lowercase column names for updatedat (migration added unquoted lowercase name)
      .where('usage.updatedat > :since OR usage."creationDate" > :since', { since: sinceMs })
      .getMany();
  }
}
