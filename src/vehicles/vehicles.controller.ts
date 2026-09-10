import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehicleEntity } from './vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';
import { OrganizationSubscriptionsService } from '../organizations/organization-subscriptions.service';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly membersService: OrganizationMembersService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
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
   * GET /vehicles
   * Alle Fahrzeuge abrufen (benötigt Auth)
   * Administratoren sehen alle oder können mit ?organizationId=... filtern
   * Andere Rollen sehen nur ihre eigenen Organisation(en)
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    return this.vehiclesService.findAll(organizationIds);
  }

  /**
   * GET /vehicles/stats
   * Fahrzeug-Statistiken abrufen (benötigt Auth)
   * Administratoren können optional ?organizationId=... übergeben, um eine bestimmte Organisation zu filtern
   * Optional ?startDate=...&endDate=... (ISO-Datetime) fuer eine Zeitraum-Filterung
   * nach usageDate - werden nur zusammen akzeptiert, nicht einzeln
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
    @Query('startDate') startDateParam?: string,
    @Query('endDate') endDateParam?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);

    if (Boolean(startDateParam) !== Boolean(endDateParam)) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'startDate and endDate must be provided together',
      );
    }

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new AppBadRequestException(
          ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
          'startDate/endDate must be valid dates',
        );
      }
    }

    return this.vehiclesService.stats(organizationIds, startDate, endDate);
  }

  /**
   * GET /vehicles/:vehicleId/last-operating-hours
   * Letzte endOperatingHours eines Fahrzeugs abrufen (benötigt Auth)
   * Normale User dürfen dies nur für Fahrzeuge ihrer eigenen Organisation(en)
   */
  @Get(':vehicleId/last-operating-hours')
  async getLastOperatingHours(
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      const organizationIds = await this.membersService.getOrganizationIds(
        user.id,
      );
      const vehicle = await this.vehiclesService.findOne(vehicleId);
      if (!vehicle || !organizationIds.includes(vehicle.organizationId)) {
        throw new AppForbiddenException(
          ErrorCode.VEHICLE_NOT_IN_YOUR_ORG,
          'Fahrzeug gehört nicht zu deiner Organisation',
        );
      }
    }

    const endOperatingHours =
      await this.vehiclesService.getLastOperatingHours(vehicleId);
    return { endOperatingHours };
  }

  /**
   * GET /vehicles/:vehicleId/usage-history
   * Nutzungsverlauf eines Fahrzeugs fuer die Detailansicht (benötigt Auth).
   * Optional ?startDate=...&endDate=... (ISO-Datetime, nur zusammen) fuer die
   * Zeitraum-Filterung nach usageDate.
   * Normale User nur fuer Fahrzeuge ihrer eigenen Organisation(en).
   */
  @Get(':vehicleId/usage-history')
  async getUsageHistory(
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: AuthUser,
    @Query('startDate') startDateParam?: string,
    @Query('endDate') endDateParam?: string,
  ) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      const organizationIds = await this.membersService.getOrganizationIds(
        user.id,
      );
      const vehicle = await this.vehiclesService.findOne(vehicleId);
      if (!vehicle || !organizationIds.includes(vehicle.organizationId)) {
        throw new AppForbiddenException(
          ErrorCode.VEHICLE_NOT_IN_YOUR_ORG,
          'Fahrzeug gehört nicht zu deiner Organisation',
        );
      }
    }

    if (Boolean(startDateParam) !== Boolean(endDateParam)) {
      throw new AppBadRequestException(
        ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
        'startDate and endDate must be provided together',
      );
    }

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new AppBadRequestException(
          ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
          'startDate/endDate must be valid dates',
        );
      }
    }

    return this.vehiclesService.usageHistory(vehicleId, startDate, endDate);
  }

  /**
   * Ermittelt die Organisation, für die ein normaler User Fahrzeuge verwalten darf
   * (Admin oder Owner in genau dieser Organisation). Administratoren dürfen jede
   * Organisation angeben.
   */
  private async resolveManagedOrganizationId(
    user: AuthUser,
    requestedOrgId?: string,
  ): Promise<string> {
    if (user.role === UserRole.ADMINISTRATOR) {
      if (!requestedOrgId) {
        throw new AppBadRequestException(
          ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
          'Organization ID is required',
        );
      }
      return requestedOrgId;
    }

    const managedOrgIds = await this.membersService.getManagedOrganizationIds(
      user.id,
    );

    if (requestedOrgId) {
      if (!managedOrgIds.includes(requestedOrgId)) {
        throw new AppForbiddenException(
          ErrorCode.ORG_NOT_MANAGER,
          'Du bist nicht Admin oder Owner dieser Organisation',
        );
      }
      return requestedOrgId;
    }

    if (managedOrgIds.length === 1) {
      return managedOrgIds[0];
    }
    if (managedOrgIds.length === 0) {
      throw new AppForbiddenException(
        ErrorCode.ORG_VEHICLE_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Fahrzeuge verwalten',
      );
    }
    throw new AppBadRequestException(
      ErrorCode.ORG_ID_AMBIGUOUS,
      'Bitte organizationId angeben - du verwaltest mehrere Organisationen',
    );
  }

  /**
   * Stellt sicher, dass der User ein bestehendes Fahrzeug bearbeiten/löschen darf:
   * Administratoren immer, normale User nur als Admin/Owner der Fahrzeug-Organisation.
   */
  private async assertCanManageVehicle(
    user: AuthUser,
    vehicle: VehicleEntity,
  ): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return;
    }

    const membership = await this.membersService.findMembership(
      user.id,
      vehicle.organizationId,
    );

    if (
      !membership ||
      (membership.role !== OrganizationRole.ADMIN &&
        membership.role !== OrganizationRole.OWNER)
    ) {
      throw new AppForbiddenException(
        ErrorCode.ORG_VEHICLE_MANAGE_FORBIDDEN,
        'Nur Organisations-Admins oder -Owner dürfen Fahrzeuge verwalten',
      );
    }
  }

  /**
   * Stellt sicher, dass das maxVehicles-Limit des aktuellen Tarifs der
   * Organisation noch nicht erreicht ist (null = unlimitiert).
   */
  private async assertVehicleLimitNotExceeded(
    organizationId: string,
  ): Promise<void> {
    const limits = await this.subscriptionsService.getLimits(organizationId);
    if (limits.maxVehicles === null) {
      return;
    }

    const currentCount =
      await this.vehiclesService.countActive(organizationId);
    if (currentCount >= limits.maxVehicles) {
      throw new AppForbiddenException(
        ErrorCode.VEHICLE_LIMIT_REACHED,
        `Das Fahrzeug-Limit von ${limits.maxVehicles} für den aktuellen Tarif ist erreicht. Bitte upgraden Sie das Abonnement, um weitere Fahrzeuge zu erfassen.`,
        { limit: limits.maxVehicles },
      );
    }
  }

  /**
   * POST /vehicles
   * Neues Fahrzeug erstellen
   * Administratoren für jede Organisation, Org-Admins/Owner nur für ihre eigene
   */
  @Post()
  async create(@Body() dto: CreateVehicleDto, @CurrentUser() user: AuthUser) {
    const orgId = await this.resolveManagedOrganizationId(
      user,
      dto.organizationId,
    );
    await this.assertVehicleLimitNotExceeded(orgId);
    return this.vehiclesService.create({ ...dto, organizationId: orgId });
  }

  /**
   * PUT /vehicles/:id
   * Fahrzeug bearbeiten
   * Administratoren für jedes Fahrzeug, Org-Admins/Owner nur für Fahrzeuge ihrer eigenen Organisation
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() user: AuthUser,
  ) {
    const vehicle = await this.vehiclesService.findOne(id);
    if (!vehicle) {
      throw new AppNotFoundException(
        ErrorCode.VEHICLE_NOT_FOUND,
        `Vehicle with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageVehicle(user, vehicle);
    return this.vehiclesService.update(id, dto);
  }

  /**
   * DELETE /vehicles/:id
   * Fahrzeug löschen
   * Administratoren für jedes Fahrzeug, Org-Admins/Owner nur für Fahrzeuge ihrer eigenen Organisation
   * Fahrzeuge mit Nutzungen werden als ausgemustert markiert,
   * Fahrzeuge ohne Nutzungen werden permanent gelöscht
   */
  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const vehicle = await this.vehiclesService.findOne(id);
    if (!vehicle) {
      throw new AppNotFoundException(
        ErrorCode.VEHICLE_NOT_FOUND,
        `Vehicle with ID ${id} not found`,
        { id },
      );
    }
    await this.assertCanManageVehicle(user, vehicle);
    return this.vehiclesService.delete(id);
  }
}
