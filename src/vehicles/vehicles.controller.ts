import { Controller, Get, Post, Body, Delete, Param } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  /**
   * GET /vehicles
   * Alle Fahrzeuge abrufen (benötigt Auth)
   */
  @Get()
  getAll(@CurrentUser() user: AuthUser) {
    // Optional: user.id nutzen für Filterung
    return this.vehiclesService.findAll();
  }

  /**
   * GET /vehicles/stats
   * Fahrzeug-Statistiken abrufen (benötigt Auth)
   */
  @Get('stats')
  getStats(@CurrentUser() user: AuthUser) {
    return this.vehiclesService.stats();
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
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateVehicleDto, @CurrentUser() user: AuthUser) {
    // Optional: user.id mit Fahrzeug verknüpfen
    return this.vehiclesService.create(dto);
  }

  /**
   * DELETE /vehicles/:id
   * Fahrzeug löschen (nur für Admins)
   */
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  delete(@Param('id') id: string) {
    // Implementiere delete in Service
    return { message: 'Fahrzeug gelöscht', id };
  }
}
