import { Controller, Get, Post, Body } from '@nestjs/common';
import { UsagesService } from './usages.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UsageEntity } from './usage.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('usages')
export class UsagesController {
  constructor(private readonly usagesService: UsagesService) {}

  /**
   * GET /usages
   * Alle Nutzungen abrufen (benötigt Auth)
   */
  @Get()
  getAll(@CurrentUser() user: AuthUser) {
    // Optional: user.id nutzen für Filterung
    return this.usagesService.findAll();
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
      creationDate: dto.creationDate,
    };
    // Optional: user.id mit Nutzung verknüpfen
    return this.usagesService.create(partial);
  }
}
