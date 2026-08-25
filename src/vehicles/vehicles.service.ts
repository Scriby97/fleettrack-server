import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';
import { UsageEntity } from '../usages/usage.entity';

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  snowsatNumber: string;
  isRetired?: boolean;
}

export interface VehicleStats {
  id: string;
  name: string;
  plate: string;
  snowsatNumber: string;
  isRetired: boolean;
  location?: string;
  vehicleType?: string;
  fuelType?: string;
  notes?: string;
  organizationId: string;
  totalWorkHours: number; // hours
  totalFuelLiters: number;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @InjectRepository(VehicleEntity)
    private readonly repo: Repository<VehicleEntity>,
    @InjectRepository(UsageEntity)
    private readonly usageRepo: Repository<UsageEntity>,
  ) {}

  /**
   * @param organizationIds - undefined = kein Org-Filter (nur für Administratoren zulässig),
   * leeres Array = User gehört keiner Organisation an -> keine Fahrzeuge sichtbar
   */
  async findAll(
    organizationIds?: string[],
    includeRetired = false,
  ): Promise<Vehicle[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    const where: any = {};

    if (organizationIds) {
      where.organizationId = In(organizationIds);
    }

    if (!includeRetired) {
      where.isRetired = false;
    }

    return this.repo.find({ where });
  }

  /**
   * Ein einzelnes Fahrzeug per ID abrufen (ohne Org-Check - Aufrufer prüft Berechtigung)
   */
  async findOne(id: string): Promise<VehicleEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Anzahl aktiver (nicht ausgemusterter) Fahrzeuge einer Organisation - für
   * die Durchsetzung des maxVehicles-Tarif-Limits.
   */
  async countActive(organizationId: string): Promise<number> {
    return this.repo.count({ where: { organizationId, isRetired: false } });
  }

  async create(
    data: Partial<Vehicle> & { organizationId: string },
  ): Promise<Vehicle> {
    const v = this.repo.create(data);
    return this.repo.save(v);
  }

  /**
   * Return vehicles with aggregated stats from usages:
   * - totalWorkHours: sum of (endTime - startTime) in hours
   * - totalFuelLiters: sum of fuelLitersRefilled
   */
  async stats(organizationIds?: string[]): Promise<VehicleStats[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    // Query vehicles left-joined with usages and aggregate
    try {
      const qb = this.repo
        .createQueryBuilder('v')
        .leftJoin(UsageEntity, 'u', 'u.vehicleId = v.id')
        .select([
          'v.id as id',
          'v.name as name',
          'v.plate as plate',
          'v.snowsatNumber as "snowsatNumber"',
          'v.isRetired as "isRetired"',
          'v.location as location',
          'v.vehicleType as "vehicleType"',
          'v.fuelType as "fuelType"',
          'v.notes as notes',
          'v.organizationId as "organizationId"',
          'COALESCE(SUM(u.endOperatingHours - u.startOperatingHours), 0) as "totalWorkHours"',
          'COALESCE(SUM(u.fuelLitersRefilled), 0) as "totalFuelLiters"',
        ])
        .groupBy(
          'v.id, v.name, v.plate, v.snowsatNumber, v.isRetired, v.location, v.vehicleType, v.fuelType, v.notes, v.organizationId',
        );

      // Filter by organization if provided
      if (organizationIds) {
        qb.where('v.organizationId IN (:...organizationIds)', {
          organizationIds,
        });
      }

      // Log the generated SQL and parameters to help debugging
      try {
        const [query, params] = qb.getQueryAndParameters();
        this.logger.debug(`Vehicle stats SQL: ${query}`);
        this.logger.debug(`Vehicle stats params: ${JSON.stringify(params)}`);
      } catch (e) {
        // ignore if query introspection isn't available
      }

      const raw = await qb.getRawMany();

      // convert string numbers to real numbers
      return raw.map((r) => ({
        id: r.id,
        name: r.name,
        plate: r.plate,
        snowsatNumber: r.snowsatNumber,
        isRetired: r.isRetired || false,
        location: r.location ?? null,
        vehicleType: r.vehicleType ?? null,
        fuelType: r.fuelType ?? null,
        notes: r.notes ?? null,
        organizationId: r.organizationId,
        totalWorkHours: Number(r.totalWorkHours) || 0,
        totalFuelLiters: Number(r.totalFuelLiters) || 0,
      }));
    } catch (err) {
      // Log and rethrow a clear error for easier debugging
      this.logger.error('Error fetching vehicle stats:', err);
      throw err;
    }
  }

  /**
   * Get the endOperatingHours from the last usage of a vehicle
   */
  async getLastOperatingHours(vehicleId: string): Promise<number | null> {
    const lastUsage = await this.usageRepo.findOne({
      where: { vehicleId },
      order: { usageDate: 'DESC' },
    });

    return lastUsage ? lastUsage.endOperatingHours : null;
  }

  /**
   * Update a vehicle
   * Authorization is checked by the controller before calling this
   */
  async update(id: string, data: Partial<Vehicle>): Promise<Vehicle> {
    const vehicle = await this.repo.findOne({ where: { id } });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    Object.assign(vehicle, data);
    return this.repo.save(vehicle);
  }

  /**
   * Delete or retire a vehicle
   * Authorization is checked by the controller before calling this
   * If the vehicle has usages, it will be marked as retired (isRetired = true)
   * If no usages exist, the vehicle will be permanently deleted
   */
  async delete(
    id: string,
  ): Promise<{ deleted: boolean; retired: boolean; message: string }> {
    const vehicle = await this.repo.findOne({ where: { id } });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Check if vehicle has any usages
    const usageCount = await this.usageRepo.count({ where: { vehicleId: id } });

    if (usageCount > 0) {
      // Vehicle has usages, mark as retired instead of deleting
      vehicle.isRetired = true;
      await this.repo.save(vehicle);
      return {
        deleted: false,
        retired: true,
        message: `Vehicle has ${usageCount} usage(s) and was marked as retired instead of being deleted`,
      };
    } else {
      // No usages, safe to delete permanently
      await this.repo.remove(vehicle);
      return {
        deleted: true,
        retired: false,
        message: 'Vehicle permanently deleted',
      };
    }
  }
}
