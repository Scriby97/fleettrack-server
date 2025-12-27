import { Controller, Get, Post, Body } from '@nestjs/common';
import { UsagesService } from './usages.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UsageEntity } from './usage.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

@Controller('usages')
export class UsagesController {
  constructor(private readonly usagesService: UsagesService) {}

  /**
   * GET /usages
   * Alle Nutzungen abrufen (benötigt Auth)
   * Admins sehen alle Usages, normale User nur ihre eigenen
   */
  @Get()
  getAll(@CurrentUser() user: AuthUser) {
    // Admins sehen alle Usages, normale User nur ihre eigenen
    const isAdmin = user.role === UserRole.ADMIN;
    return this.usagesService.findAll(isAdmin ? undefined : user.id);
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
      creatorId: user.id,
    };
    return this.usagesService.create(partial);
  }
}
