import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VehiclesService } from './vehicles/vehicles.service';
import { UsagesService } from './usages/usages.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { UsagesController } from './usages/usages.controller';

@Module({
  imports: [],
  controllers: [AppController,
    VehiclesController,
    UsagesController
  ],
  providers: [AppService,
    VehiclesService,
    UsagesService
  ],
})
export class AppModule {}
