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
}
