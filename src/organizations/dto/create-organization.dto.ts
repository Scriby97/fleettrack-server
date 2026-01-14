import { IsString, IsEmail, IsOptional, MinLength, IsEnum } from 'class-validator';
import { UserRole } from '../../auth/enums/user-role.enum';

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

  // Neues Feld: Admin Email für Invite
  @IsEmail()
  adminEmail: string;

  @IsString()
  @IsOptional()
  adminFirstName?: string;

  @IsString()
  @IsOptional()
  adminLastName?: string;

  @IsEnum(UserRole)
  @IsOptional()
  adminRole?: UserRole; // Default: admin, kann auch super_admin sein
}
