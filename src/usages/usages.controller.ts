import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { UsagesService } from './usages.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UpdateUsageDto } from './dto/update-usage.dto';
import { UsageEntity } from './usage.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

@Controller('usages')
export class UsagesController {
  constructor(private readonly usagesService: UsagesService) {}

  /**
   * GET /usages/with-vehicles
   * Alle Nutzungen mit Fahrzeug-Daten abrufen (benötigt Auth)
   * Super-Admins sehen alle Usages (oder gefiltert nach ausgewählter Org)
   * Admins sehen alle Usages ihrer Organisation
   * Normale Users sehen nur ihre eigenen Usages
   */
  @Get('with-vehicles')
  async getAllWithVehicles(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    let filterOrgId: string | undefined;
    let filterCreatorId: string | undefined;

    if (user.role === UserRole.SUPER_ADMIN) {
      // Super-Admins können alle sehen oder eine bestimmte Org auswählen (über organizationId)
      filterOrgId = organizationId; // undefined wenn keine Org ausgewählt
    } else if (user.role === UserRole.ADMIN) {
      // Admins sehen alle Usages ihrer Organisation
      filterOrgId = organizationId;
    } else {
      // Normale Users sehen nur ihre eigenen Usages
      filterOrgId = organizationId;
      filterCreatorId = user.id;
    }

    const usages = await this.usagesService.findAllWithVehicles(filterOrgId, filterCreatorId);
    return { usages };
  }

  /**
   * GET /usages
   * Alle Nutzungen abrufen (benötigt Auth)
   * Super-Admins sehen alle Usages (oder gefiltert nach ausgewählter Org)
   * Admins/Users sehen nur Usages ihrer Organisation
   */
  @Get()
  getAll(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    // Super-Admins können alle sehen oder eine bestimmte Org auswählen
    // Andere Rollen sehen nur ihre eigene Organisation
    const filterOrgId = user.role === UserRole.SUPER_ADMIN ? undefined : organizationId;
    return this.usagesService.findAll(filterOrgId);
  }

  /**
   * POST /usages
   * Neue Nutzung erstellen (benötigt Auth)
   */
  @Post()
  create(@Body() dto: CreateUsageDto, @CurrentUser() user: AuthUser) {
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
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const partial: Partial<UsageEntity> = {
      ...dto,
    };
    return this.usagesService.update(id, partial);
  }

  /**
   * DELETE /usages/:id
   * Usage löschen (benötigt Auth)
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.usagesService.delete(id);
    return { message: 'Usage gelöscht', id };
  }
}
