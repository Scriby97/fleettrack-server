import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  IsDate,
  IsPositive,
} from 'class-validator';
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  fuelLitersRefilled?: number;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  usageDate?: Date;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  creationDate?: number;

  // Vom Frontend gesetzt, nachdem der User eine Lücken-/Überschneidungs-
  // Warnung (siehe checkHoursContinuity) bewusst bestätigt hat - überspringt
  // die erneute Prüfung bei diesem Speicherversuch.
  @IsBoolean()
  @IsOptional()
  confirmDespiteWarning?: boolean;
}
