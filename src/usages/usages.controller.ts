import { Controller, Get, Post, Body } from '@nestjs/common';
import { UsagesService } from './usages.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UsageEntity } from './usage.entity';

@Controller('usages')
export class UsagesController {
  constructor(private readonly usagesService: UsagesService) {}

  @Get()
  getAll() {
    return this.usagesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateUsageDto) {
    // transform DTO to a Partial<UsageEntity> and pass to service
    const partial: Partial<UsageEntity> = {
      vehicleId: dto.vehicleId,
      startTime: new Date(dto.startTime),
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      fuelLitersRefilled: dto.fuelLitersRefilled ?? 0,
    };
    return this.usagesService.create(partial);
  }
}
