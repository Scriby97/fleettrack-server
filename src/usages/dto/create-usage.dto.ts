import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUsageDto {
  @IsString()
  vehicleId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  startOperatingHours: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  endOperatingHours?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fuelLitersRefilled: number;
}
