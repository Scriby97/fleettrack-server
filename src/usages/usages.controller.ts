import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { UsagesService } from './usages.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UpdateUsageDto } from './dto/update-usage.dto';
import { UsageEntity } from './usage.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';
import { parseOptionalDateRange } from '../common/utils/date-range.util';
import { decodeUsageCursor, parseOptionalLimit } from './usage-cursor.util';

@Controller('usages')
export class UsagesController {
  constructor(
    private readonly usagesService: UsagesService,
    private readonly vehiclesService: VehiclesService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  /**
   * Ermittelt die Organisation(en), auf die eine Anfrage gescoped werden soll.
   * Administratoren: kein Filter (undefined), optional per ?organizationId= einschränkbar.
   * Normale User: mit ?organizationId= genau diese eine (muss eigene Mitgliedschaft sein) -
   * für den Organisations-Switcher im Frontend. Ohne Parameter alle eigenen Organisationen
   * (leeres Array = keine).
   */
  private async resolveOrganizationIds(
    user: AuthUser,
    queryOrgId?: string,
  ): Promise<string[] | undefined> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return queryOrgId ? [queryOrgId] : undefined;
    }

    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );

    if (queryOrgId) {
      if (!organizationIds.includes(queryOrgId)) {
        throw new AppForbiddenException(
          ErrorCode.ORG_NOT_MEMBER_OF_TARGET,
          'Du bist kein Mitglied dieser Organisation',
        );
      }
      return [queryOrgId];
    }

    return organizationIds;
  }

  /**
   * Mitarbeiter (employee) sehen nur ihre eigenen Usages; Admin/Owner (jeder
   * betroffenen Organisation) und globale Administratoren sehen alle. Prüft
   * jede resolvte Organisation einzeln - reicht eine davon Admin/Owner-Rechte,
   * wird nicht eingeschränkt.
   */
  private async resolveCreatorIdFilter(
    user: AuthUser,
    organizationIds: string[] | undefined,
  ): Promise<string | undefined> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return undefined;
    }
    if (!organizationIds || organizationIds.length === 0) {
      return undefined;
    }

    for (const organizationId of organizationIds) {
      const membership = await this.membersService.findMembership(
        user.id,
        organizationId,
      );
      if (
        membership &&
        (membership.role === OrganizationRole.ADMIN ||
          membership.role === OrganizationRole.OWNER)
      ) {
        return undefined;
      }
    }

    return user.id;
  }

  /**
   * GET /usages/with-vehicles
   * Alle Nutzungen mit Fahrzeug-Daten abrufen (benötigt Auth)
   * Administratoren sehen alle Usages oder können mit ?organizationId=... filtern.
   * Admin/Owner einer Organisation sehen alle Usages dieser Organisation,
   * Mitarbeiter (employee) nur ihre eigenen.
   * Optional ?startDate=...&endDate=... (ISO-Datetime, nur zusammen) fuer die
   * Zeitraum-Filterung nach usageDate.
   * Optional ?limit=...&cursor=... fuer Cursor-Pagination (neueste zuerst): die
   * Antwort enthaelt { usages, nextCursor } - nextCursor (null = letzte Seite)
   * wird beim naechsten Aufruf als ?cursor= mitgegeben. Ohne limit werden alle
   * Treffer geliefert (Kalenderansicht, dort ist der Zeitraum ein Monat/eine Woche).
   * Optional ?vehicleId=... schraenkt auf ein einzelnes Fahrzeug ein (Nutzungen-Tab
   * der Fahrzeug-Detailseite).
   */
  @Get('with-vehicles')
  async getAllWithVehicles(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
    @Query('startDate') startDateParam?: string,
    @Query('endDate') endDateParam?: string,
    @Query('limit') limitParam?: string,
    @Query('cursor') cursorParam?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    const creatorId = await this.resolveCreatorIdFilter(user, organizationIds);
    const { startDate, endDate } = parseOptionalDateRange(
      startDateParam,
      endDateParam,
    );
    const limit = parseOptionalLimit(limitParam);
    const cursor = cursorParam ? decodeUsageCursor(cursorParam) : undefined;
    return this.usagesService.findAllWithVehicles(
      organizationIds,
      creatorId,
      startDate,
      endDate,
      limit,
      cursor,
      vehicleId,
    );
  }

  /**
   * GET /usages
   * Alle Nutzungen abrufen (benötigt Auth)
   * Administratoren sehen alle Usages oder können mit ?organizationId=... filtern.
   * Admin/Owner einer Organisation sehen alle Usages dieser Organisation,
   * Mitarbeiter (employee) nur ihre eigenen.
   * Optional ?startDate=...&endDate=... (ISO-Datetime, nur zusammen) fuer die
   * Zeitraum-Filterung nach usageDate - ohne Angabe komplette Historie.
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
    @Query('startDate') startDateParam?: string,
    @Query('endDate') endDateParam?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    const creatorId = await this.resolveCreatorIdFilter(user, organizationIds);
    const { startDate, endDate } = parseOptionalDateRange(
      startDateParam,
      endDateParam,
    );
    return this.usagesService.findAll(
      organizationIds,
      creatorId,
      startDate,
      endDate,
    );
  }

  /**
   * POST /usages
   * Neue Nutzung erstellen (benötigt Auth)
   * Normale User dürfen nur Usages für Fahrzeuge ihrer eigenen Organisation(en) erstellen
   */
  @Post()
  async create(@Body() dto: CreateUsageDto, @CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertVehicleInUsersOrganization(dto.vehicleId, user);
    }

    if (
      !dto.confirmDespiteWarning &&
      dto.usageDate &&
      dto.endOperatingHours !== undefined
    ) {
      await this.assertHoursContinuityOrThrow(
        dto.vehicleId,
        dto.usageDate,
        dto.startOperatingHours,
        dto.endOperatingHours,
      );
    }

    // transform DTO to a Partial<UsageEntity> and pass to service
    const partial: Partial<UsageEntity> = {
      vehicleId: dto.vehicleId,
      startOperatingHours: dto.startOperatingHours,
      endOperatingHours: dto.endOperatingHours,
      fuelLitersRefilled: dto.fuelLitersRefilled ?? 0,
      creationDate: Date.now(),
      usageDate: dto.usageDate,
      creatorId: user.id,
    };
    return this.usagesService.create(partial);
  }

  /**
   * PUT /usages/:id
   * Usage aktualisieren (benötigt Auth)
   * Admin/Owner der Organisation (oder globale Administratoren) dürfen jede
   * Usage bearbeiten. Mitarbeiter (employee) dürfen zusätzlich ihre eigenen
   * Usages bearbeiten, aber keine fremden.
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUsageDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertCanEditUsage(id, user);
    }

    if (!dto.confirmDespiteWarning) {
      const current = await this.usagesService.findOne(id);
      if (current) {
        await this.assertHoursContinuityOrThrow(
          dto.vehicleId ?? current.vehicleId,
          dto.usageDate ?? current.usageDate,
          dto.startOperatingHours ?? current.startOperatingHours,
          dto.endOperatingHours ?? current.endOperatingHours,
          id,
        );
      }
    }

    // confirmDespiteWarning ist kein Entity-Feld - explizit ausschliessen statt mitzuspeichern.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmDespiteWarning, ...partial } = dto;
    return this.usagesService.update(id, partial as Partial<UsageEntity>);
  }

  /**
   * Wirft AppConflictException (USAGE_HOURS_GAP/USAGE_HOURS_OVERLAP), falls
   * die Nutzung nicht lückenlos an den chronologisch benachbarten Eintrag
   * desselben Fahrzeugs anschliesst (siehe UsagesService.checkHoursContinuity).
   * Blockiert das Speichern nur vorläufig - das Frontend zeigt die Meldung als
   * Bestätigungsdialog und wiederholt den Request mit confirmDespiteWarning=true.
   *
   * Gibt es Probleme auf BEIDEN Seiten (vorheriger UND nächster Nachbar - z.B.
   * ein Eintrag wird mitten zwischen zwei bestehende verschoben, ohne an einen
   * davon anzuschliessen), werden beide über params transportiert: das primäre
   * Problem wie gehabt über code/message/params.hours, das zweite zusätzlich
   * über params.secondaryCode/secondaryHours - das Frontend hängt dafür eine
   * zweite, mit demselben Code-Namespace übersetzte Zeile an (siehe
   * createUsage.tsx/usages.tsx), ohne dass neue Übersetzungs-Keys nötig sind.
   */
  private async assertHoursContinuityOrThrow(
    vehicleId: string,
    usageDate: Date,
    startOperatingHours: number,
    endOperatingHours: number,
    excludeId?: string,
  ): Promise<void> {
    const issues = await this.usagesService.checkHoursContinuity(
      vehicleId,
      usageDate,
      startOperatingHours,
      endOperatingHours,
      excludeId,
    );
    const [primary, secondary] = issues;
    if (!primary) return;

    const codeFor = (issue: { type: 'gap' | 'overlap' }) =>
      issue.type === 'gap'
        ? ErrorCode.USAGE_HOURS_GAP
        : ErrorCode.USAGE_HOURS_OVERLAP;
    const messageFor = (issue: { type: 'gap' | 'overlap'; hours: number }) =>
      issue.type === 'gap'
        ? `Lücke von ${issue.hours}h zum benachbarten Eintrag dieses Fahrzeugs`
        : `Überschneidung von ${issue.hours}h mit einem benachbarten Eintrag dieses Fahrzeugs`;

    throw new AppConflictException(codeFor(primary), messageFor(primary), {
      hours: primary.hours,
      ...(secondary
        ? { secondaryCode: codeFor(secondary), secondaryHours: secondary.hours }
        : {}),
    });
  }

  /**
   * DELETE /usages/:id
   * Usage löschen (benötigt Auth)
   * Nur Admin/Owner der Organisation (oder globale Administratoren) dürfen
   * Usages löschen - Mitarbeiter (employee) nicht, auch nicht ihre eigenen.
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertCanManageUsage(id, user);
    }

    await this.usagesService.delete(id);
    return { message: 'Usage gelöscht', id };
  }

  private async assertVehicleInUsersOrganization(
    vehicleId: string,
    user: AuthUser,
  ): Promise<void> {
    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );
    if (organizationIds.length === 0) {
      throw new AppForbiddenException(
        ErrorCode.ORG_NO_MEMBERSHIP,
        'Du gehörst keiner Organisation an',
      );
    }

    const vehicle = await this.vehiclesService.findOne(vehicleId);
    if (!vehicle || !organizationIds.includes(vehicle.organizationId)) {
      throw new AppForbiddenException(
        ErrorCode.VEHICLE_NOT_IN_YOUR_ORG,
        'Fahrzeug gehört nicht zu deiner Organisation',
      );
    }
  }

  /**
   * Nur Admin/Owner der Organisation, zu der die Usage gehört, dürfen sie
   * löschen - auch der ursprüngliche Ersteller (employee) nicht, wenn er
   * nicht selbst Admin/Owner ist.
   */
  private async assertCanManageUsage(
    usageId: string,
    user: AuthUser,
  ): Promise<void> {
    const usage = await this.usagesService.findOne(usageId);
    if (!usage) {
      throw new AppNotFoundException(
        ErrorCode.USAGE_NOT_FOUND,
        `Usage with id ${usageId} not found`,
        { id: usageId },
      );
    }

    const membership = await this.membersService.findMembership(
      user.id,
      usage.vehicle.organizationId,
    );
    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.USAGE_DELETE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Nutzungen löschen',
      );
    }
  }

  /**
   * Admin/Owner der Organisation dürfen jede Usage bearbeiten. Ein Mitarbeiter
   * (employee) darf zusätzlich seine eigene Usage bearbeiten (aber keine
   * fremde).
   */
  private async assertCanEditUsage(
    usageId: string,
    user: AuthUser,
  ): Promise<void> {
    const usage = await this.usagesService.findOne(usageId);
    if (!usage) {
      throw new AppNotFoundException(
        ErrorCode.USAGE_NOT_FOUND,
        `Usage with id ${usageId} not found`,
        { id: usageId },
      );
    }

    if (usage.creatorId === user.id) {
      return;
    }

    const membership = await this.membersService.findMembership(
      user.id,
      usage.vehicle.organizationId,
    );
    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.USAGE_EDIT_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen fremde Nutzungen bearbeiten',
      );
    }
  }
}
