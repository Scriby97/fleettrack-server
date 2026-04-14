import { Controller, Get, Post, Body, Delete, Param, Put, Query, BadRequestException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  /**
   * GET /vehicles
   * Alle Fahrzeuge abrufen (benötigt Auth)
   * Super-Admins sehen alle oder können mit ?organizationId=... filtern
   * Andere Rollen sehen nur ihre Organisation
   */
  @Get()
  getAll(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const filterOrgId = user.role === UserRole.SUPER_ADMIN ? (queryOrgId || undefined) : organizationId;
    return this.vehiclesService.findAll(filterOrgId);
  }

  /**
   * GET /vehicles/stats
   * Fahrzeug-Statistiken abrufen (benötigt Auth)
   * Super-Admins können optional ?organizationId=... übergeben, um eine bestimmte Organisation zu filtern
   */
  @Get('stats')
  getStats(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
    @Query('organizationId') queryOrgId?: string,
  ) {
    let filterOrgId: string | undefined;
    if (user.role === UserRole.SUPER_ADMIN) {
      filterOrgId = queryOrgId || undefined; // Super-Admin kann optional filtern
    } else {
      filterOrgId = organizationId; // Normale Admins sehen nur ihre Organisation
    }
    return this.vehiclesService.stats(filterOrgId);
  }

  /**
   * GET /vehicles/:vehicleId/last-operating-hours
   * Letzte endOperatingHours eines Fahrzeugs abrufen (benötigt Auth)
   */
  @Get(':vehicleId/last-operating-hours')
  async getLastOperatingHours(
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const endOperatingHours = await this.vehiclesService.getLastOperatingHours(vehicleId);
    return { endOperatingHours };
  }

  /**
   * POST /vehicles
   * Neues Fahrzeug erstellen (nur für Admins)
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  create(
    @Body() dto: CreateVehicleDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    // Verwende die Organization des Users, außer Super-Admin gibt explizit eine an
    const orgId = dto.organizationId || organizationId;
    if (!orgId) {
      throw new BadRequestException('Organization ID is required');
    }
    return this.vehiclesService.create({ ...dto, organizationId: orgId });
  }

  /**
   * PUT /vehicles/:id
   * Fahrzeug bearbeiten (nur für Admins)
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    return this.vehiclesService.update(id, dto, user.role, organizationId);
  }

  /**
   * DELETE /vehicles/:id
   * Fahrzeug löschen (nur für Admins)
   * Fahrzeuge mit Nutzungen werden als ausgemustert markiert,
   * Fahrzeuge ohne Nutzungen werden permanent gelöscht
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    return this.vehiclesService.delete(id, user.role, organizationId);
  }
}
