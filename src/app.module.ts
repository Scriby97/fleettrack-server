import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VehicleEntity } from './vehicles/vehicle.entity';
import { UsageEntity } from './usages/usage.entity';
import { UserProfileEntity } from './auth/entities/user-profile.entity';
import { UsagesService } from './usages/usages.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { UsagesController } from './usages/usages.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'SkiweltGstaad',
      database: process.env.DB_NAME || 'postgres',
      entities: [VehicleEntity, UsageEntity, UserProfileEntity],
      synchronize: true,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
     TypeOrmModule.forFeature([VehicleEntity, UsageEntity]),
     SupabaseModule,
     AuthModule,
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
