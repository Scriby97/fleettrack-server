import { IsOptional, IsUUID } from 'class-validator';

export class UpdatePriorityVehicleDto {
  // null löscht die Auswahl (zurück zum "zuletzt verwendeten Fahrzeug"-
  // Standardverhalten) - @IsOptional() lässt sowohl null als auch undefined
  // ohne IsUUID-Prüfung durch.
  @IsOptional()
  @IsUUID()
  priorityVehicleId: string | null;
}
