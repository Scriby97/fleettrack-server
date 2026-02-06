import { IsString, Length, IsOptional } from 'class-validator';

export class UpdateVehicleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @Length(1, 20)
  @IsOptional()
  plate?: string;

  @IsString()
  @IsOptional()
  snowsatNumber?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  vehicleType?: string;

  @IsString()
  @IsOptional()
  fuelType?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
