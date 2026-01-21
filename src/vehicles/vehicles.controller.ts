import { Controller, Get, Post, Body, Delete, Param, Put } from '@nestjs/common';
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
   * Super-Admins sehen alle, andere nur ihre Organisation
   */
  @Get()
  getAll(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    // Super-Admins sehen alle Fahrzeuge, andere nur ihre Organisation
    const filterOrgId = user.role === UserRole.SUPER_ADMIN ? undefined : organizationId;
    return this.vehiclesService.findAll(filterOrgId);
  }

  /**
   * GET /vehicles/stats
   * Fahrzeug-Statistiken abrufen (benötigt Auth)
   */
  @Get('stats')
  getStats(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    const filterOrgId = user.role === UserRole.SUPER_ADMIN ? undefined : organizationId;
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
      throw new Error('Organization ID is required');
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
