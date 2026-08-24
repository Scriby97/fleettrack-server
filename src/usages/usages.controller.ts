import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsagesService } from './usages.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UpdateUsageDto } from './dto/update-usage.dto';
import { UsageEntity } from './usage.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';

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
        throw new ForbiddenException(
          'Du bist kein Mitglied dieser Organisation',
        );
      }
      return [queryOrgId];
    }

    return organizationIds;
  }

  /**
   * GET /usages/with-vehicles
   * Alle Nutzungen mit Fahrzeug-Daten abrufen (benötigt Auth)
   * Administratoren sehen alle Usages oder können mit ?organizationId=... filtern
   * Normale Users sehen nur Usages ihrer eigenen Organisation(en)
   */
  @Get('with-vehicles')
  async getAllWithVehicles(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    const usages =
      await this.usagesService.findAllWithVehicles(organizationIds);
    return { usages };
  }

  /**
   * GET /usages
   * Alle Nutzungen abrufen (benötigt Auth)
   * Administratoren sehen alle Usages oder können mit ?organizationId=... filtern
   * Normale Users sehen nur Usages ihrer eigenen Organisation(en)
   */
  @Get()
  async getAll(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    return this.usagesService.findAll(organizationIds);
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
   * Normale User dürfen nur Usages ihrer eigenen Organisation(en) bearbeiten
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUsageDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertUsageInUsersOrganization(id, user);
    }

    const partial: Partial<UsageEntity> = {
      ...dto,
    };
    return this.usagesService.update(id, partial);
  }

  /**
   * DELETE /usages/:id
   * Usage löschen (benötigt Auth)
   * Normale User dürfen nur Usages ihrer eigenen Organisation(en) löschen
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.ADMINISTRATOR) {
      await this.assertUsageInUsersOrganization(id, user);
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
      throw new ForbiddenException('Du gehörst keiner Organisation an');
    }

    const vehicle = await this.vehiclesService.findOne(vehicleId);
    if (!vehicle || !organizationIds.includes(vehicle.organizationId)) {
      throw new ForbiddenException(
        'Fahrzeug gehört nicht zu deiner Organisation',
      );
    }
  }

  private async assertUsageInUsersOrganization(
    usageId: string,
    user: AuthUser,
  ): Promise<void> {
    const usage = await this.usagesService.findOne(usageId);
    if (!usage) {
      throw new NotFoundException(`Usage with id ${usageId} not found`);
    }

    const organizationIds = await this.membersService.getOrganizationIds(
      user.id,
    );
    if (!organizationIds.includes(usage.vehicle.organizationId)) {
      throw new ForbiddenException('Usage gehört nicht zu deiner Organisation');
    }
  }
}
