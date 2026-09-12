import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UsageEntity } from './usage.entity';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';

@Injectable()
export class UsagesService {
  constructor(
    @InjectRepository(UsageEntity)
    private readonly repo: Repository<UsageEntity>,
  ) {}

  /**
   * Find all usages, optionally filtered by organization membership
   * Uses JOIN with vehicles table since usages don't have direct organizationId
   * @param organizationIds - undefined = kein Filter (nur Administratoren), leeres Array = keine Organisation -> keine Usages
   * @param creatorId - falls gesetzt (normale Mitarbeiter ohne Admin/Owner-Rolle), zusätzlich auf die eigenen Usages einschränken
   */
  async findAll(
    organizationIds?: string[],
    creatorId?: string,
  ): Promise<UsageEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    if (organizationIds || creatorId) {
      const qb = this.repo
        .createQueryBuilder('usage')
        .innerJoin('usage.vehicle', 'vehicle');

      if (organizationIds) {
        qb.where('vehicle.organizationId IN (:...organizationIds)', {
          organizationIds,
        });
      }
      if (creatorId) {
        qb.andWhere('usage.creatorId = :creatorId', { creatorId });
      }

      return qb.getMany();
    }
    // Administrator ohne Organisations-Filter sieht alle Usages
    return this.repo.find();
  }

  /**
   * Find all usages with vehicle data included
   * Returns usages with nested vehicle information (id, name, plate)
   * @param organizationIds - undefined = kein Filter (nur Administratoren), leeres Array = keine Organisation -> keine Usages
   * @param creatorId - falls gesetzt (normale Mitarbeiter ohne Admin/Owner-Rolle), zusätzlich auf die eigenen Usages einschränken
   */
  async findAllWithVehicles(
    organizationIds?: string[],
    creatorId?: string,
  ): Promise<any[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    const queryBuilder = this.repo
      .createQueryBuilder('usage')
      .innerJoinAndSelect('usage.vehicle', 'vehicle')
      .innerJoinAndSelect('usage.creator', 'creator')
      .orderBy('usage.creationDate', 'DESC');

    if (organizationIds) {
      queryBuilder.where('vehicle.organizationId IN (:...organizationIds)', {
        organizationIds,
      });
    }
    if (creatorId) {
      queryBuilder.andWhere('usage.creatorId = :creatorId', { creatorId });
    }

    const usages = await queryBuilder.getMany();

    // Transform to match expected response format
    return usages.map((usage) => ({
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
        vehicleType: usage.vehicle.vehicleType,
      },
      creator: {
        id: usage.creator.id,
        firstName: usage.creator.firstName,
        lastName: usage.creator.lastName,
        // Fallback fuers Frontend, falls Vor-/Nachname fehlen (z.B. Accounts,
        // die vor der Vorname/Nachname-Pflicht bei der Registrierung
        // angelegt wurden - dort war frueher nur ein einzelnes "Name"-Feld
        // vorhanden, das gar nicht gespeichert wurde).
        email: usage.creator.email,
      },
    }));
  }

  /**
   * Eine einzelne Usage inkl. Fahrzeug abrufen (ohne Org-Check - Aufrufer prüft Berechtigung)
   */
  async findOne(id: string): Promise<UsageEntity | null> {
    return this.repo.findOne({ where: { id }, relations: ['vehicle'] });
  }

  // Accept a DeepPartial<UsageEntity> so callers (controllers or other services)
  // can pass either a DTO or a partially-built entity.
  async create(data: DeepPartial<UsageEntity>): Promise<UsageEntity> {
    const toSave: DeepPartial<UsageEntity> = {
      ...data,
      startOperatingHours: data.startOperatingHours ?? 0,
      endOperatingHours: data.endOperatingHours,
      fuelLitersRefilled: data.fuelLitersRefilled ?? 0,
    };
    const saved = await this.repo.save(this.repo.create(toSave));
    return saved;
  }

  async update(
    id: string,
    data: DeepPartial<UsageEntity>,
  ): Promise<UsageEntity> {
    await this.repo.update(id, data);
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) {
      throw new AppNotFoundException(
        ErrorCode.USAGE_NOT_FOUND,
        `Usage with id ${id} not found`,
        { id },
      );
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
