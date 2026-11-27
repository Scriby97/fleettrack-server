import { IsNumber, Min } from 'class-validator';

export class UpdateStartingReadingDto {
  @IsNumber()
  @Min(0)
  currentOperatingHours: number;
}
