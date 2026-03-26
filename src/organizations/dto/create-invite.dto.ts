import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { UserRole } from '../../auth/enums/user-role.enum';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsUUID()
  @IsOptional()
  organizationId?: string; // Optional für SUPER_ADMIN beim Invite für andere Orgs

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.USER;
}
