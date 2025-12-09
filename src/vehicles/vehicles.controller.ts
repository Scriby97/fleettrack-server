import { Controller, Get } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';

@Controller()
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  getHello(): string {
    return this.vehiclesService.getHello();
  }
}
