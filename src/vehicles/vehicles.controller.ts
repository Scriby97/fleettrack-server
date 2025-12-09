import { Controller, Get } from '@nestjs/common';
import { VehiclesService, Vehicle } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  getHello(): Vehicle[] {
    return this.vehiclesService.getHello();
  }
}
