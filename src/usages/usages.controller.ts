import { Controller, Get } from '@nestjs/common';
import { UsagesService } from './usages.service';

@Controller()
export class UsagesController {
  constructor(private readonly usagesService: UsagesService) {}

  @Get()
  getHello(): string {
    return this.usagesService.getHello();
  }
}
