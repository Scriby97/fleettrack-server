import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';
import { UsageEntity } from '../usages/usage.entity';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';

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
  // Betriebsstunden der chronologisch ersten/letzten Nutzung im
  // angefragten Zeitraum (nach usageDate, nicht creationDate) - null,
  // wenn das Fahrzeug im Zeitraum keine Nutzung hat.
  periodStartHours: number | null;
  periodEndHours: number | null;
  totalFuelLiters: number;
}

export interface UsageHistoryDay {
  date: string; // 'YYYY-MM-DD'
  operatingHours: number;
  fuelLiters: number;
  usageCount: number;
}

export interface UsageHistory {
  vehicle: VehicleEntity;
  totals: {
    operatingHours: number;
    fuelLiters: number;
    firstHours: number | null;
    lastHours: number | null;
    usageCount: number;
  };
  daily: UsageHistoryDay[];
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
   * Return vehicles with aggregated stats from usages, optional auf einen
   * Zeitraum eingeschraenkt (nach usageDate - dem Erfassungsdatum der
   * Nutzung, NICHT creationDate, das erst spaeter/nachtraeglich passiert
   * sein kann):
   * - periodStartHours/periodEndHours: startOperatingHours der chronologisch
   *   ersten bzw. endOperatingHours der chronologisch letzten Nutzung im
   *   Zeitraum (null, falls keine Nutzung im Zeitraum)
   * - totalFuelLiters: Summe fuelLitersRefilled im Zeitraum
   *
   * Die Zeitraum-Bedingung sitzt bewusst im JOIN (nicht in WHERE), damit
   * Fahrzeuge ohne Nutzung im Zeitraum trotzdem in der Ergebnisliste
   * bleiben (nur mit leeren Werten), statt ganz zu verschwinden.
   */
  async stats(
    organizationIds?: string[],
    startDate?: Date,
    endDate?: Date,
  ): Promise<VehicleStats[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    // Query vehicles left-joined with usages and aggregate
    try {
      let joinCondition = 'u.vehicleId = v.id';
      const joinParams: Record<string, Date> = {};
      if (startDate && endDate) {
        joinCondition +=
          ' AND u.usageDate >= :statsStartDate AND u.usageDate <= :statsEndDate';
        joinParams.statsStartDate = startDate;
        joinParams.statsEndDate = endDate;
      }

      const qb = this.repo
        .createQueryBuilder('v')
        .leftJoin(UsageEntity, 'u', joinCondition, joinParams)
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
          '(ARRAY_AGG(u.startOperatingHours ORDER BY u.usageDate ASC))[1] as "periodStartHours"',
          '(ARRAY_AGG(u.endOperatingHours ORDER BY u.usageDate DESC))[1] as "periodEndHours"',
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
        periodStartHours:
          r.periodStartHours === null || r.periodStartHours === undefined
            ? null
            : Number(r.periodStartHours),
        periodEndHours:
          r.periodEndHours === null || r.periodEndHours === undefined
            ? null
            : Number(r.periodEndHours),
        totalFuelLiters: Number(r.totalFuelLiters) || 0,
      }));
    } catch (err) {
      // Log and rethrow a clear error for easier debugging
      this.logger.error('Error fetching vehicle stats:', err);
      throw err;
    }
  }

  /**
   * Nutzungsverlauf eines einzelnen Fahrzeugs, optional auf einen Zeitraum
   * (nach usageDate) eingeschraenkt - fuer die Fahrzeug-Detailansicht:
   * - totals: Betriebsstunden (Summe endOperatingHours - startOperatingHours)
   *   und getankte Liter im Zeitraum, plus Stand der ersten/letzten Nutzung
   * - daily: pro Kalendertag mit mindestens einer Nutzung ein Eintrag
   *   (aufsteigend) fuer das Aktivitaets-Diagramm
   */
  async usageHistory(
    vehicleId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<UsageHistory> {
    const vehicle = await this.repo.findOne({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new AppNotFoundException(
        ErrorCode.VEHICLE_NOT_FOUND,
        `Vehicle with ID ${vehicleId} not found`,
        { id: vehicleId },
      );
    }

    const qb = this.usageRepo
      .createQueryBuilder('u')
      .select("to_char(u.usageDate, 'YYYY-MM-DD')", 'date')
      .addSelect(
        'COALESCE(SUM(u.endOperatingHours - u.startOperatingHours), 0)',
        'operatingHours',
      )
      .addSelect('COALESCE(SUM(u.fuelLitersRefilled), 0)', 'fuelLiters')
      .addSelect('COUNT(*)', 'usageCount')
      .where('u.vehicleId = :vehicleId', { vehicleId })
      .groupBy("to_char(u.usageDate, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC');

    if (startDate && endDate) {
      qb.andWhere('u.usageDate >= :startDate AND u.usageDate <= :endDate', {
        startDate,
        endDate,
      });
    }

    const rawDaily = await qb.getRawMany<{
      date: string;
      operatingHours: string;
      fuelLiters: string;
      usageCount: string;
    }>();

    const daily: UsageHistoryDay[] = rawDaily.map((r) => ({
      date: r.date,
      operatingHours: Number(r.operatingHours) || 0,
      fuelLiters: Number(r.fuelLiters) || 0,
      usageCount: Number(r.usageCount) || 0,
    }));

    const totals = daily.reduce(
      (acc, d) => {
        acc.operatingHours += d.operatingHours;
        acc.fuelLiters += d.fuelLiters;
        acc.usageCount += d.usageCount;
        return acc;
      },
      { operatingHours: 0, fuelLiters: 0, usageCount: 0 },
    );

    const dateWhere =
      startDate && endDate
        ? { vehicleId, usageDate: Between(startDate, endDate) }
        : { vehicleId };
    const [firstUsage, lastUsage] = await Promise.all([
      this.usageRepo.findOne({
        where: dateWhere,
        order: { usageDate: 'ASC' },
      }),
      this.usageRepo.findOne({
        where: dateWhere,
        order: { usageDate: 'DESC' },
      }),
    ]);

    return {
      vehicle,
      totals: {
        operatingHours: Number(totals.operatingHours.toFixed(1)),
        fuelLiters: totals.fuelLiters,
        firstHours:
          firstUsage == null ? null : Number(firstUsage.startOperatingHours),
        lastHours:
          lastUsage == null ? null : Number(lastUsage.endOperatingHours),
        usageCount: totals.usageCount,
      },
      daily,
    };
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
      throw new AppNotFoundException(
        ErrorCode.VEHICLE_NOT_FOUND,
        `Vehicle with ID ${id} not found`,
        { id },
      );
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
      throw new AppNotFoundException(
        ErrorCode.VEHICLE_NOT_FOUND,
        `Vehicle with ID ${id} not found`,
        { id },
      );
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
