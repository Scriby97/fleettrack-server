import {
  IsString,
  Length,
  IsUUID,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  name: string;

  @IsString()
  @Length(1, 20)
  plate: string;

  @IsString()
  snowsatNumber: string;

  // Betriebsstunden- bzw. Kilometerstand des Fahrzeugs zum Zeitpunkt der
  // Erfassung (welche Einheit gilt, entscheidet vehicleType - siehe
  // lib/vehicles/metric.ts im Frontend). Pflichtfeld, damit die erste echte
  // Nutzung nicht faelschlich ab 0 gerechnet wird - siehe
  // VehiclesService.create(), das daraus eine Start=Ende-Referenz-Nutzung anlegt.
  @IsNumber()
  @Min(0)
  currentOperatingHours: number;

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

  @IsUUID()
  @IsOptional()
  organizationId?: string; // Optional für Super-Admins, die für andere Orgs erstellen
}
