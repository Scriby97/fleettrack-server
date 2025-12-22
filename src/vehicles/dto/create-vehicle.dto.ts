import { IsString, Length } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  name: string;

  @IsString()
  @Length(1, 20)
  plate: string;

  @IsString()
  snowsatNumber: string;
}