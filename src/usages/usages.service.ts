import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UsageEntity } from './usage.entity';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';
import { encodeUsageCursor, type UsageCursor } from './usage-cursor.util';

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
   * @param startDate/endDate - optional, beide zusammen: nur Nutzungen mit usageDate in diesem Zeitraum
   *   (skaliert die Liste sonst unbegrenzt mit der gesamten Historie - siehe idx_usages_vehicle_usage_date)
   */
  async findAll(
    organizationIds?: string[],
    creatorId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<UsageEntity[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    if (organizationIds || creatorId || (startDate && endDate)) {
      const qb = this.repo
        .createQueryBuilder('usage')
        .innerJoin('usage.vehicle', 'vehicle')
        // Wegen Nichtzahlung archivierte Fahrzeuge sollen mit ihren
        // Nutzungen aus der Uebersicht verschwinden, bis die Organisation
        // wieder zahlt (siehe VehiclesService/OrganizationSubscriptionsService).
        .where('vehicle.archivedAt IS NULL');

      if (organizationIds) {
        qb.andWhere('vehicle.organizationId IN (:...organizationIds)', {
          organizationIds,
        });
      }
      if (creatorId) {
        qb.andWhere('usage.creatorId = :creatorId', { creatorId });
      }
      if (startDate && endDate) {
        qb.andWhere(
          'usage.usageDate >= :startDate AND usage.usageDate <= :endDate',
          {
            startDate,
            endDate,
          },
        );
      }

      return qb.getMany();
    }
    // Administrator ohne Organisations-/Zeitraum-Filter sieht alle Usages
    return this.repo.find();
  }

  /**
   * Find all usages with vehicle data included
   * Returns usages with nested vehicle information (id, name, plate)
   * @param organizationIds - undefined = kein Filter (nur Administratoren), leeres Array = keine Organisation -> keine Usages
   * @param creatorId - falls gesetzt (normale Mitarbeiter ohne Admin/Owner-Rolle), zusätzlich auf die eigenen Usages einschränken
   * @param startDate/endDate - optional, beide zusammen: nur Nutzungen mit usageDate in diesem Zeitraum
   * @param limit - optional: Seitengroesse (neueste zuerst). Ohne limit werden alle Treffer geliefert
   *   (z.B. fuer die Kalenderansicht, die ohnehin auf einen Zeitraum begrenzt ist).
   * @param cursor - optional: Position der letzten bereits geladenen Nutzung (usageDate, id) -
   *   liefert die naechsten Eintraege danach. Stabil auch, wenn zwischenzeitlich neue Nutzungen erfasst werden.
   */
  async findAllWithVehicles(
    organizationIds?: string[],
    creatorId?: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number,
    cursor?: UsageCursor,
  ): Promise<{ usages: any[]; nextCursor: string | null }> {
    if (organizationIds && organizationIds.length === 0) {
      return { usages: [], nextCursor: null };
    }

    const queryBuilder = this.repo
      .createQueryBuilder('usage')
      .innerJoinAndSelect('usage.vehicle', 'vehicle')
      .innerJoinAndSelect('usage.creator', 'creator')
      .where('vehicle.archivedAt IS NULL')
      .orderBy('usage.usageDate', 'DESC')
      .addOrderBy('usage.id', 'DESC');

    if (organizationIds) {
      queryBuilder.andWhere('vehicle.organizationId IN (:...organizationIds)', {
        organizationIds,
      });
    }
    if (creatorId) {
      queryBuilder.andWhere('usage.creatorId = :creatorId', { creatorId });
    }
    if (startDate && endDate) {
      queryBuilder.andWhere(
        'usage.usageDate >= :startDate AND usage.usageDate <= :endDate',
        { startDate, endDate },
      );
    }

    if (cursor) {
      queryBuilder.andWhere(
        '(usage.usageDate, usage.id) < (:cursorDate, CAST(:cursorId AS uuid))',
        { cursorDate: cursor.usageDate, cursorId: cursor.id },
      );
    }
    if (limit) {
      // Eine Zeile mehr holen, um zu wissen, ob es eine weitere Seite gibt.
      queryBuilder.limit(limit + 1);
    }

    const fetched = await queryBuilder.getMany();
    const hasMore = limit !== undefined && fetched.length > limit;
    const usages = hasMore ? fetched.slice(0, limit) : fetched;
    const last = usages[usages.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeUsageCursor({ usageDate: last.usageDate, id: last.id })
        : null;

    // Transform to match expected response format
    const items = usages.map((usage) => ({
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

    return { usages: items, nextCursor };
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
