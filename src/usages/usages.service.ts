import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UsageEntity } from './usage.entity';
import { AppNotFoundException, ErrorCode } from '../common/exceptions';
import { encodeUsageCursor, type UsageCursor } from './usage-cursor.util';

export interface UsageWithVehicleDetail {
  id: string;
  vehicleId: string;
  creatorId: string;
  startOperatingHours: number;
  endOperatingHours: number;
  fuelLitersRefilled: number;
  creationDate: number;
  usageDate: Date;
  vehicle: { id: string; name: string; plate: string; vehicleType?: string };
  creator: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
}

export interface InconsistentUsagePair {
  type: 'gap' | 'overlap';
  hours: number;
  previous: UsageWithVehicleDetail;
  current: UsageWithVehicleDetail;
}

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
   * @param vehicleId - optional: nur Nutzungen dieses einen Fahrzeugs (Nutzungen-Tab der Fahrzeug-Detailseite).
   */
  async findAllWithVehicles(
    organizationIds?: string[],
    creatorId?: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number,
    cursor?: UsageCursor,
    vehicleId?: string,
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
    if (vehicleId) {
      queryBuilder.andWhere('usage.vehicleId = :vehicleId', { vehicleId });
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
    const items = usages.map((usage) => this.mapUsageWithVehicle(usage));

    return { usages: items, nextCursor };
  }

  /**
   * Flacht eine Usage (mit geladenen vehicle-/creator-Relationen) auf das
   * vom Frontend erwartete Response-Format ab - gemeinsam genutzt von
   * findAllWithVehicles und findInconsistentPairs.
   */
  private mapUsageWithVehicle(usage: UsageEntity): UsageWithVehicleDetail {
    return {
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
    };
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

  /**
   * Prüft, ob eine (neue oder bearbeitete) Nutzung lückenlos an den
   * chronologisch benachbarten Eintrag desselben Fahrzeugs anschliesst.
   * Ein Betriebsstundenzähler läuft nur während der Fahrt - zwischen zwei
   * Nutzungen bewegt er sich nicht. Korrekt verkettet gilt also: Endstand
   * einer Nutzung = Startstand der chronologisch nächsten. "Chronologisch"
   * meint hier usageDate (wann tatsächlich gefahren wurde), nicht wann der
   * Eintrag erfasst wurde - sonst würde nachträgliches Erfassen (siehe
   * Fleet-Overview-Zeitraumfilter) die Kette künstlich aufreissen. Da
   * usageDate nur ein Datum ist (kein Zeitstempel), dient startOperatingHours
   * als Tie-Breaker für mehrere Eintraege am selben Tag.
   *
   * Nutzt den bestehenden Index idx_usages_vehicle_usage_date
   * (vehicleId, usageDate) - beide Lookups sind einfache, indexierte
   * "nächster Nachbar"-Abfragen mit LIMIT 1, keine Tabellen-Scans. Bei den
   * hier üblichen Datenmengen (wenige Nutzungen pro Fahrzeug und Tag) liegt
   * die zusätzliche Latenz im Bereich von Bruchteilen einer Millisekunde -
   * unbedenklich, synchron vor jedem Speichern auszuführen.
   *
   * @param excludeId - beim Bearbeiten die eigene ID, damit sich der Eintrag
   *   nicht selbst als Nachbarn findet
   * @returns leeres Array, wenn lückenlos/keine Nachbarn vorhanden, sonst bis
   *   zu zwei Probleme (Index 0 = vorheriger Nachbar, Index 1 = nächster
   *   Nachbar - z.B. wenn ein Eintrag mitten zwischen zwei bestehende
   *   verschoben wird, ohne an einen der beiden anzuschliessen, entstehen
   *   gleichzeitig zwei unabhängige Probleme)
   */
  async checkHoursContinuity(
    vehicleId: string,
    usageDate: Date,
    startOperatingHours: number,
    endOperatingHours: number,
    excludeId?: string,
  ): Promise<Array<{ type: 'gap' | 'overlap'; hours: number }>> {
    const buildNeighborQuery = (direction: 'previous' | 'next') => {
      const qb = this.repo
        .createQueryBuilder('u')
        .where('u.vehicleId = :vehicleId', { vehicleId });

      if (excludeId) {
        qb.andWhere('u.id != :excludeId', { excludeId });
      }

      if (direction === 'previous') {
        qb.andWhere(
          '(u.usageDate < :usageDate OR (u.usageDate = :usageDate AND u.startOperatingHours < :startOperatingHours))',
          { usageDate, startOperatingHours },
        )
          .orderBy('u.usageDate', 'DESC')
          .addOrderBy('u.startOperatingHours', 'DESC');
      } else {
        qb.andWhere(
          '(u.usageDate > :usageDate OR (u.usageDate = :usageDate AND u.startOperatingHours > :startOperatingHours))',
          { usageDate, startOperatingHours },
        )
          .orderBy('u.usageDate', 'ASC')
          .addOrderBy('u.startOperatingHours', 'ASC');
      }

      return qb.limit(1).getOne();
    };

    const [previous, next] = await Promise.all([
      buildNeighborQuery('previous'),
      buildNeighborQuery('next'),
    ]);

    // Rundungsdifferenzen durch decimal(10,1) ignorieren (< 0.05h sind kein
    // echtes Problem).
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const issues: Array<{ type: 'gap' | 'overlap'; hours: number }> = [];

    if (previous) {
      const diff = round1(startOperatingHours - previous.endOperatingHours);
      if (diff > 0.05) issues.push({ type: 'gap', hours: diff });
      else if (diff < -0.05) issues.push({ type: 'overlap', hours: -diff });
    }

    if (next) {
      const diff = round1(next.startOperatingHours - endOperatingHours);
      if (diff > 0.05) issues.push({ type: 'gap', hours: diff });
      else if (diff < -0.05) issues.push({ type: 'overlap', hours: -diff });
    }

    return issues;
  }

  /**
   * Findet alle Paare chronologisch aufeinanderfolgender Nutzungen eines
   * Fahrzeugs, die nicht lückenlos ineinander übergehen (Lücke oder
   * Überschneidung) - für den "Nur inkonsistente Nutzungen"-Filter im
   * Nutzungen-Tab der Fahrzeug-Detailseite. Gleiche Diff-Logik/Toleranz wie
   * checkHoursContinuity, aber über die komplette Historie des Fahrzeugs statt
   * nur die direkten Nachbarn eines einzelnen (neuen/bearbeiteten) Eintrags.
   *
   * @param organizationIds - falls gesetzt, wird das Ergebnis leer, wenn das
   *   Fahrzeug keiner dieser Organisationen gehört (gleiches Muster wie
   *   findAllWithVehicles) - schützt vor organisationsübergreifendem Zugriff.
   */
  async findInconsistentPairs(
    vehicleId: string,
    organizationIds?: string[],
  ): Promise<InconsistentUsagePair[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    const qb = this.repo
      .createQueryBuilder('usage')
      .innerJoinAndSelect('usage.vehicle', 'vehicle')
      .innerJoinAndSelect('usage.creator', 'creator')
      .where('usage.vehicleId = :vehicleId', { vehicleId })
      .orderBy('usage.usageDate', 'ASC')
      .addOrderBy('usage.startOperatingHours', 'ASC');

    if (organizationIds) {
      qb.andWhere('vehicle.organizationId IN (:...organizationIds)', {
        organizationIds,
      });
    }

    const usages = await qb.getMany();

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const pairs: InconsistentUsagePair[] = [];

    for (let i = 1; i < usages.length; i++) {
      const previous = usages[i - 1];
      const current = usages[i];
      const diff = round1(
        current.startOperatingHours - previous.endOperatingHours,
      );

      if (diff > 0.05) {
        pairs.push({
          type: 'gap',
          hours: diff,
          previous: this.mapUsageWithVehicle(previous),
          current: this.mapUsageWithVehicle(current),
        });
      } else if (diff < -0.05) {
        pairs.push({
          type: 'overlap',
          hours: -diff,
          previous: this.mapUsageWithVehicle(previous),
          current: this.mapUsageWithVehicle(current),
        });
      }
    }

    return pairs;
  }
}
