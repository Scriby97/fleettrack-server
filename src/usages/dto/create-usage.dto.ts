import { IsString, IsISO8601, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUsageDto {
  @IsString()
  vehicleId: string;

  @IsISO8601()
  startTime: string;

  @IsISO8601()
  @IsOptional()
  endTime?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fuelLitersRefilled: number;
}
