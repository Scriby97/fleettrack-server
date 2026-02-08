import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';
import { UsageEntity } from '../usages/usage.entity';
import { UserRole } from '../auth/enums/user-role.enum';

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
  totalWorkHours: number; // hours
  totalFuelLiters: number;
  isRetired: boolean;
}

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly repo: Repository<VehicleEntity>,
    @InjectRepository(UsageEntity)
    private readonly usageRepo: Repository<UsageEntity>,
  ) {}

  async findAll(organizationId?: string, includeRetired = false): Promise<Vehicle[]> {
    const where: any = {};
    
    if (organizationId) {
      where.organizationId = organizationId;
    }
    
    if (!includeRetired) {
      where.isRetired = false;
    }
    
    return this.repo.find({ where });
  }

  async create(data: Partial<Vehicle> & { organizationId: string }): Promise<Vehicle> {
    const v = this.repo.create(data);
    return this.repo.save(v);
  }

  /**
   * Return vehicles with aggregated stats from usages:
   * - totalWorkHours: sum of (endTime - startTime) in hours
   * - totalFuelLiters: sum of fuelLitersRefilled
   */
  async stats(organizationId?: string): Promise<VehicleStats[]> {
    // Query vehicles left-joined with usages and aggregate
    try {
      const qb = this.repo.createQueryBuilder('v')
        .leftJoin(UsageEntity, 'u', 'u.vehicleId = v.id')
        .select([
          'v.id as id',
          'v.name as name',
          'v.plate as plate',
          'v.snowsatNumber as "snowsatNumber"',
          'v.isRetired as "isRetired"',
          'COALESCE(SUM(u.endOperatingHours - u.startOperatingHours), 0) as "totalWorkHours"',
          'COALESCE(SUM(u.fuelLitersRefilled), 0) as "totalFuelLiters"',
        ])
        .groupBy('v.id, v.name, v.plate, v.snowsatNumber, v.isRetired');

      // Filter by organization if provided
      if (organizationId) {
        qb.where('v.organizationId = :organizationId', { organizationId });
      }

      // Log the generated SQL and parameters to help debugging
      try {
        const [query, params] = qb.getQueryAndParameters();
        // eslint-disable-next-line no-console
        console.log('Vehicle stats SQL:', query);
        // eslint-disable-next-line no-console
        console.log('Vehicle stats params:', params);
      } catch (e) {
        // ignore if query introspection isn't available
      }

      const raw = await qb.getRawMany();

      // convert string numbers to real numbers
      return raw.map(r => ({
        id: r.id,
        name: r.name,
        plate: r.plate,
        snowsatNumber: r.snowsatNumber,
        isRetired: r.isRetired || false,
        totalWorkHours: Number(r.totalWorkHours) || 0,
        totalFuelLiters: Number(r.totalFuelLiters) || 0,
      }));
    } catch (err) {
      // Log and rethrow a clear error for easier debugging
      // eslint-disable-next-line no-console
      console.error('Error fetching vehicle stats:', err);
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
   * Super-Admins can update any vehicle
   * Regular admins can only update vehicles in their organization
   */
  async update(
    id: string,
    data: Partial<Vehicle>,
    userRole?: string,
    organizationId?: string,
  ): Promise<Vehicle> {
    const vehicle = await this.repo.findOne({ where: { id } });
    
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Check authorization: Regular admins can only update vehicles in their organization
    if (userRole !== UserRole.SUPER_ADMIN && vehicle.organizationId !== organizationId) {
      throw new ForbiddenException('You can only update vehicles in your organization');
    }

    // Update the vehicle
    Object.assign(vehicle, data);
    return this.repo.save(vehicle);
  }

  /**
   * Delete or retire a vehicle
   * If the vehicle has usages, it will be marked as retired (isRetired = true)
   * If no usages exist, the vehicle will be permanently deleted
   */
  async delete(
    id: string,
    userRole?: string,
    organizationId?: string,
  ): Promise<{ deleted: boolean; retired: boolean; message: string }> {
    const vehicle = await this.repo.findOne({ where: { id } });
    
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Check authorization: Regular admins can only delete vehicles in their organization
    if (userRole !== UserRole.SUPER_ADMIN && vehicle.organizationId !== organizationId) {
      throw new ForbiddenException('You can only delete vehicles in your organization');
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

  // getHello(): Vehicle[] {
  //   return [
  //     { id: '1', name: 'Pistenbully 600', plate: 'BE 245 834' },
  //     { id: '2', name: 'Ratrak 600', plate: 'BE 512 091' },
  //     { id: '3', name: 'PistenBully 400 W', plate: 'BE 687 445' },
  //     { id: '4', name: 'Snowcat ST4', plate: 'BE 834 567' },
  //     { id: '5', name: 'Hägglunds BV206', plate: 'BE 923 156' },
  //     { id: '6', name: 'Loon ST5', plate: 'BE 178 203' },
  //   ];
  // }
