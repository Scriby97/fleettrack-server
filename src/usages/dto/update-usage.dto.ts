import { IsString, IsOptional, IsNumber, Min, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUsageDto {
  @IsString()
  @IsOptional()
  vehicleId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  startOperatingHours?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
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
  creationDate?: Date;
}
