import { IsString, IsOptional, IsNumber, Min, IsDate, IsPositive, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUsageDto {
  @IsString()
  @IsOptional()
  vehicleId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @IsOptional()
  startOperatingHours?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsPositive()
  @IsOptional()
  endOperatingHours?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  fuelLitersRefilled?: number;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  usageDate?: Date;
}
