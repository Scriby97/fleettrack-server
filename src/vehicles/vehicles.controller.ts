import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  Put,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';
import { OrganizationMembersService } from '../organizations/organization-members.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  /**
   * Ermittelt die Organisation(en), auf die eine Anfrage gescoped werden soll.
   * Administratoren: kein Filter (undefined), optional per ?organizationId= einschränkbar.
   * Normale User: alle Organisationen, in denen sie Mitglied sind (leeres Array = keine).
   */
  private async resolveOrganizationIds(
    user: AuthUser,
    queryOrgId?: string,
  ): Promise<string[] | undefined> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return queryOrgId ? [queryOrgId] : undefined;
    }
    return this.membersService.getOrganizationIds(user.id);
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
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') queryOrgId?: string,
  ) {
    const organizationIds = await this.resolveOrganizationIds(user, queryOrgId);
    return this.vehiclesService.stats(organizationIds);
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
        throw new ForbiddenException(
          'Fahrzeug gehört nicht zu deiner Organisation',
        );
      }
    }

    const endOperatingHours =
      await this.vehiclesService.getLastOperatingHours(vehicleId);
    return { endOperatingHours };
  }

  /**
   * POST /vehicles
   * Neues Fahrzeug erstellen (nur für Administratoren)
   */
  @Roles(UserRole.ADMINISTRATOR)
  @Post()
  create(
    @Body() dto: CreateVehicleDto,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    // Verwende die Organization des Users, außer Administrator gibt explizit eine an
    const orgId = dto.organizationId || organizationId;
    if (!orgId) {
      throw new BadRequestException('Organization ID is required');
    }
    return this.vehiclesService.create({ ...dto, organizationId: orgId });
  }

  /**
   * PUT /vehicles/:id
   * Fahrzeug bearbeiten (nur für Administratoren)
   */
  @Roles(UserRole.ADMINISTRATOR)
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
   * Fahrzeug löschen (nur für Administratoren)
   * Fahrzeuge mit Nutzungen werden als ausgemustert markiert,
   * Fahrzeuge ohne Nutzungen werden permanent gelöscht
   */
  @Roles(UserRole.ADMINISTRATOR)
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId?: string,
  ) {
    return this.vehiclesService.delete(id, user.role, organizationId);
  }
}
