import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../auth/enums/user-role.enum';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.USER;
}
