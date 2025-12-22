import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';
import { UsageEntity } from '../usages/usage.entity';

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  snowsatNumber: string;
}

export interface VehicleStats {
  id: string;
  name: string;
  plate: string;
  snowsatNumber: string;
  totalWorkHours: number; // hours
  totalFuelLiters: number;
}

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly repo: Repository<VehicleEntity>,
    @InjectRepository(UsageEntity)
    private readonly usageRepo: Repository<UsageEntity>,
  ) {}

  async findAll(): Promise<Vehicle[]> {
    return this.repo.find();
  }

  async create(data: Partial<Vehicle>): Promise<Vehicle> {
    const v = this.repo.create(data);
    return this.repo.save(v);
  }

  /**
   * Return vehicles with aggregated stats from usages:
   * - totalWorkHours: sum of (endTime - startTime) in hours
   * - totalFuelLiters: sum of fuelLitersRefilled
   */
  async stats(): Promise<VehicleStats[]> {
    // Query vehicles left-joined with usages and aggregate
    try {
      const qb = this.repo.createQueryBuilder('v')
        .leftJoin(UsageEntity, 'u', 'u.vehicleId = v.id')
        .select([
          'v.id as id',
          'v.name as name',
          'v.plate as plate',
          'v.snowsatNumber as "snowsatNumber"',
          'COALESCE(SUM(u.endOperatingHours - u.startOperatingHours), 0) as "totalWorkHours"',
          'COALESCE(SUM(u.fuelLitersRefilled), 0) as "totalFuelLiters"',
        ])
        .groupBy('v.id, v.name, v.plate, v.snowsatNumber');

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
