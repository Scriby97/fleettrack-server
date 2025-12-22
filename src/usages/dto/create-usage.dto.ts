import { IsString, IsOptional, IsNumber, Min, IsDate } from 'class-validator';
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

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  creationDate?: Date;
}
