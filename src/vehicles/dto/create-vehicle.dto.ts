import { IsString, Length, IsUUID, IsOptional } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  name: string;

  @IsString()
  @Length(1, 20)
  plate: string;

  @IsString()
  snowsatNumber: string;

  @IsUUID()
  @IsOptional()
  organizationId?: string; // Optional für Super-Admins, die für andere Orgs erstellen
}