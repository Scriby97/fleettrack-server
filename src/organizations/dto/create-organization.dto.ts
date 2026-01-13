import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  subdomain?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;
}
