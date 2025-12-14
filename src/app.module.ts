import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VehicleEntity } from './vehicles/vehicle.entity';
import { UsageEntity } from './usages/usage.entity';
import { UsagesService } from './usages/usages.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { UsagesController } from './usages/usages.controller';
import { VehiclesService } from './vehicles/vehicles.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',      // passe ggf. an
      password: 'admin',      // passe ggf. an
      database: 'postgres',    // erstelle DB falls nötig
      entities: [VehicleEntity, UsageEntity],
      synchronize: true,         // dev only
    }),
     TypeOrmModule.forFeature([VehicleEntity, UsageEntity]),
  ],
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
